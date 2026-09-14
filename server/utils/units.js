/**
 * units.js — single source of truth for wholesale units and unit conversion.
 *
 * Business context: MandiConnect is a single-seller wholesale platform. A
 * product is always bought and sold in ONE fixed unit (products.unit) — the
 * customer never picks a different unit at checkout — so most of the app
 * (MOQ, stock, price tiers, order quantity) compares numbers that are
 * already in the same unit and never needs conversion.
 *
 * Conversion is still needed for two things:
 *   1. Weight-equivalence reporting (e.g. "total stock on hand, in kg" across
 *      products that are stocked in different units like quintal/ton/kg).
 *   2. Defensive validation that a unit string is one the system actually
 *      understands, in one place instead of being duplicated across
 *      migrations/validators/frontend.
 *
 * Conversion is done in integer GRAMS (not kg-as-float) specifically so that
 * "1 quintal = 100 kg" / "1 ton = 1000 kg" can never accumulate
 * floating-point drift (0.1 + 0.2 !== 0.3 style bugs) when aggregating
 * across many rows. Only weight-based units are convertible; count-based
 * units (piece, dozen, crate, box, bag) have no shared base and are
 * reported on their own.
 */

// Grams-per-unit, using integers only.
const GRAMS_PER_UNIT = {
    gram: 1,
    kg: 1000,
    quintal: 100000, // 1 quintal = 100 kg
    ton: 1000000 // 1 ton = 1000 kg
};

// All units the platform accepts for a product. Keep this list in sync with
// the `products_unit_enum` DB enum (see migrations/products.js and
// migrations/productsWholesaleUpgrade.js).
const WEIGHT_UNITS = Object.keys(GRAMS_PER_UNIT); // ['gram', 'kg', 'quintal', 'ton']
const COUNT_UNITS = ['piece', 'dozen', 'crate', 'box', 'bag'];
const ALLOWED_UNITS = [...WEIGHT_UNITS, ...COUNT_UNITS];

const isValidUnit = (unit) => typeof unit === 'string' && ALLOWED_UNITS.includes(unit);

const isWeightUnit = (unit) => WEIGHT_UNITS.includes(unit);

/**
 * Converts a quantity expressed in `unit` to whole grams (integer).
 * Returns null for non-weight (count-based) units, since they have no
 * common base to convert into.
 * Throws on an unrecognised unit — callers should validate with
 * isValidUnit() first if the unit came from user input.
 */
const toBaseGrams = (quantity, unit) => {
    if (!isValidUnit(unit)) {
        throw new Error(`Unknown unit: ${unit}`);
    }
    if (!isWeightUnit(unit)) {
        return null;
    }
    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity)) {
        throw new Error(`Invalid quantity: ${quantity}`);
    }
    // Round to the nearest gram so repeated conversions stay exact integers
    // even if the caller passed a decimal (e.g. 2.5 quintal).
    return Math.round(numericQuantity * GRAMS_PER_UNIT[unit]);
};

/**
 * Human-friendly kg-equivalent for display (e.g. admin inventory summaries).
 * Returns null for count-based units.
 */
const toKgEquivalent = (quantity, unit) => {
    const grams = toBaseGrams(quantity, unit);
    return grams === null ? null : grams / 1000;
};

module.exports = {
    GRAMS_PER_UNIT,
    WEIGHT_UNITS,
    COUNT_UNITS,
    ALLOWED_UNITS,
    isValidUnit,
    isWeightUnit,
    toBaseGrams,
    toKgEquivalent
};