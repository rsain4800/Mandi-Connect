const { pool } = require('../config/db');

const ALLOWED_STATE = 'Rajasthan';

// Normalizes state text for comparison (case/whitespace insensitive)
const isRajasthanState = (stateValue) => {
    if (!stateValue) return false;
    return stateValue.trim().toLowerCase() === ALLOWED_STATE.toLowerCase();
};

// Full server-side validation of a delivery location.
// Returns { valid: true, zone, district, pincodeRow } or { valid: false, message }
const validateDeliveryLocation = async (state, pincode) => {
    if (!isRajasthanState(state)) {
        return {
            valid: false,
            message: `Sorry, we currently deliver only within Rajasthan. "${state}" is not a serviceable state.`
        };
    }

    if (!pincode || !/^\d{6}$/.test(String(pincode).trim())) {
        return { valid: false, message: 'Please provide a valid 6-digit Rajasthan pincode.' };
    }

    const [rows] = await pool.query(
        `SELECT sp.*, d.name AS district_name, z.name AS zone_name, z.shipping_charge,
                z.estimated_delivery_days_min, z.estimated_delivery_days_max, z.is_active AS zone_active
         FROM serviceable_pincodes sp
         JOIN rajasthan_districts d ON sp.district_id = d.id
         JOIN delivery_zones z ON sp.delivery_zone_id = z.id
         WHERE sp.pincode = ?`,
        [String(pincode).trim()]
    );

    if (rows.length === 0) {
        return {
            valid: false,
            message: `We don't currently deliver to pincode ${pincode}. Please check our serviceable areas or contact support.`
        };
    }

    const row = rows[0];

    if (!row.is_active || !row.zone_active) {
        return {
            valid: false,
            message: `Delivery to pincode ${pincode} is temporarily unavailable.`
        };
    }

    return {
        valid: true,
        pincodeRow: row,
        district: { id: row.district_id, name: row.district_name },
        zone: {
            id: row.delivery_zone_id,
            name: row.zone_name,
            shipping_charge: row.delivery_charge_override ?? row.shipping_charge,
            estimated_delivery_days_min: row.estimated_delivery_days_min,
            estimated_delivery_days_max: row.estimated_delivery_days_max
        },
        min_order_override: row.min_order_override
    };
};

module.exports = {
    ALLOWED_STATE,
    isRajasthanState,
    validateDeliveryLocation
};