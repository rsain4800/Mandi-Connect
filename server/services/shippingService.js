/**
 * services/shippingService.js — Phase 7: single, centralized place for
 * every "is this order/address deliverable, and what does it cost"
 * decision in the app.
 *
 * Before this file existed, the exact same
 * district -> zone -> pincode join query and Rajasthan-only check was
 * duplicated across middleware/rajasthanValidation.js and
 * utils/rajasthanValidation.js, while addressController.js and
 * orderController.js already required a `services/shippingService`
 * module that did not exist (an empty file) — every address save and
 * every checkout was calling a function that was never defined. This
 * file is that missing implementation, and it is now the ONLY place
 * that:
 *   1. Enforces "we only deliver within Rajasthan".
 *   2. Resolves a pincode to its district + delivery zone via the
 *      Rajasthan District -> Delivery Zone -> Serviceable Pincode
 *      architecture (schema unchanged — see migrations 003/005/010).
 *   3. Computes the shipping charge for an order (zone charge, minus
 *      any per-pincode override, minus free-shipping-over-threshold).
 *
 * addressController.js and orderController.js both call into this
 * module instead of querying these tables directly, so there is exactly
 * one implementation to keep correct — never a second copy that could
 * silently drift (e.g. one copy checking `is_active` and another
 * forgetting to).
 */

const { pool } = require('../config/db');

const ALLOWED_STATE = 'Rajasthan';

// Normalizes state text for comparison (case/whitespace insensitive) —
// "rajasthan", " Rajasthan ", "RAJASTHAN" all match; anything else doesn't.
const isRajasthanState = (stateValue) => {
    if (!stateValue) return false;
    return String(stateValue).trim().toLowerCase() === ALLOWED_STATE.toLowerCase();
};

const PINCODE_REGEX = /^\d{6}$/;

/**
 * Full server-side validation of a delivery location (state + pincode).
 * This is the ONLY function in the app allowed to decide "this address is
 * (or is not) currently serviceable" — never trust a client-supplied
 * flag, a stale `addresses.district`/`serviceable_pincode_id` snapshot,
 * or anything computed on the frontend.
 *
 * @param {string} state
 * @param {string|number} pincode
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} [runner]
 *        Optional pool/connection to query through — pass the caller's
 *        own transaction `connection` (see orderController.createOrder)
 *        so this check runs inside the same transaction/lock scope as
 *        the rest of checkout, instead of a separate connection that
 *        could race a concurrent admin edit. Defaults to the shared pool
 *        for callers (like addressController) that aren't already inside
 *        a transaction.
 * @returns {Promise<{valid: true, zone: object, district: object, pincodeRow: object, min_order_override: number|null}
 *                   | {valid: false, message: string, code: string}>}
 */
const validateDeliveryLocation = async (state, pincode, runner = pool) => {
    if (!isRajasthanState(state)) {
        return {
            valid: false,
            code: 'STATE_NOT_SERVICEABLE',
            message: `Sorry, we currently deliver only within Rajasthan. "${state}" is not a serviceable state.`
        };
    }

    const trimmedPincode = pincode !== undefined && pincode !== null ? String(pincode).trim() : '';
    if (!PINCODE_REGEX.test(trimmedPincode)) {
        return {
            valid: false,
            code: 'INVALID_PINCODE',
            message: 'Please provide a valid 6-digit Rajasthan pincode.'
        };
    }

    const [rows] = await runner.query(
        `SELECT sp.*, d.name AS district_name, z.name AS zone_name, z.shipping_charge,
                z.estimated_delivery_days_min, z.estimated_delivery_days_max, z.is_active AS zone_active
         FROM serviceable_pincodes sp
         JOIN rajasthan_districts d ON sp.district_id = d.id
         JOIN delivery_zones z ON sp.delivery_zone_id = z.id
         WHERE sp.pincode = ?`,
        [trimmedPincode]
    );

    if (rows.length === 0) {
        return {
            valid: false,
            code: 'PINCODE_NOT_SERVICEABLE',
            message: `We don't currently deliver to pincode ${trimmedPincode}. Please check our serviceable areas or contact support.`
        };
    }

    const row = rows[0];

    // Both the specific pincode AND the zone it belongs to must be active.
    // An admin can deactivate either independently (e.g. pause one town
    // without pausing its whole zone, or pause an entire zone in one move
    // rather than every pincode in it) — either one being off means this
    // pincode is not currently deliverable.
    if (!row.is_active || !row.zone_active) {
        return {
            valid: false,
            code: 'PINCODE_INACTIVE',
            message: `Delivery to pincode ${trimmedPincode} is temporarily unavailable.`
        };
    }

    return {
        valid: true,
        pincodeRow: row,
        district: { id: row.district_id, name: row.district_name },
        zone: {
            id: row.delivery_zone_id,
            name: row.zone_name,
            // A per-pincode override, if the admin set one, always wins
            // over the zone's base charge.
            shipping_charge: row.delivery_charge_override !== null && row.delivery_charge_override !== undefined
                ? parseFloat(row.delivery_charge_override)
                : parseFloat(row.shipping_charge),
            estimated_delivery_days_min: row.estimated_delivery_days_min,
            estimated_delivery_days_max: row.estimated_delivery_days_max
        },
        min_order_override: row.min_order_override !== null && row.min_order_override !== undefined
            ? parseFloat(row.min_order_override)
            : null
    };
};

/**
 * Computes the shipping charge (and minimum-order eligibility) for an
 * order, given its subtotal, a resolved `deliveryLocation` (the `valid:
 * true` result of validateDeliveryLocation above), and the site-wide
 * `shipping_settings` row.
 *
 * This is the ONLY place order totals get their shipping charge from —
 * orderController must never compute it inline, and no other controller
 * should either, so a future change to the free-shipping rule or the
 * override precedence only ever needs to change here.
 *
 * @param {object} params
 * @param {number} params.subtotal
 * @param {{valid: true, zone: object, min_order_override: number|null}} params.deliveryLocation
 * @param {{free_shipping_threshold?: number}} [params.shippingSettings]
 * @returns {{shippingCharge: number, meetsMinOrder: boolean, minOrderRequired: number, freeShippingApplied: boolean}}
 */
const calculateShipping = ({ subtotal, deliveryLocation, shippingSettings = {} }) => {
    if (!deliveryLocation || !deliveryLocation.valid) {
        throw new Error('calculateShipping requires a valid deliveryLocation.');
    }

    const numericSubtotal = parseFloat(subtotal) || 0;

    // Minimum order value — a per-pincode override (e.g. a far-flung rural
    // zone that's only economical above a certain basket size) takes
    // precedence; otherwise there is no minimum.
    const minOrderRequired = deliveryLocation.min_order_override !== null && deliveryLocation.min_order_override !== undefined
        ? deliveryLocation.min_order_override
        : 0;
    const meetsMinOrder = numericSubtotal >= minOrderRequired;

    // Free-shipping threshold is genuinely global site policy (not
    // zone-specific), so it still comes from shipping_settings even
    // though the base charge itself is now per-zone/per-pincode.
    const freeShippingThreshold = shippingSettings.free_shipping_threshold !== undefined
        && shippingSettings.free_shipping_threshold !== null
        ? parseFloat(shippingSettings.free_shipping_threshold)
        : null;

    const freeShippingApplied = freeShippingThreshold !== null && freeShippingThreshold >= 0
        && numericSubtotal >= freeShippingThreshold;

    const shippingCharge = freeShippingApplied ? 0 : parseFloat(deliveryLocation.zone.shipping_charge) || 0;

    return {
        shippingCharge,
        meetsMinOrder,
        minOrderRequired,
        freeShippingApplied
    };
};

module.exports = {
    ALLOWED_STATE,
    isRajasthanState,
    validateDeliveryLocation,
    calculateShipping
};