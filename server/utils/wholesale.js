/**
 * wholesale.js — MOQ, stock, and wholesale price-tier logic.
 *
 * Kept as pure functions (no DB access) on purpose:
 *   - It is the single place cartController and orderController both call,
 *     so "add to cart" and "place order" can never disagree about what's a
 *     valid quantity.
 *   - It is trivially unit-testable without a running MySQL instance.
 *
 * All quantities here are already in the product's own selling unit
 * (products.unit) — see units.js for why no runtime unit conversion is
 * needed for this comparison.
 */

const { isValidUnit } = require('./units');

/**
 * Validates a requested order quantity against a product's wholesale rules.
 *
 * @param {Object} params
 * @param {number} params.quantity - requested quantity
 * @param {number} params.minimumOrderQuantity - product MOQ
 * @param {number|null} params.maximumOrderQuantity - product MOQ ceiling, or null/undefined for none
 * @param {number} params.availableStock - current stock on hand
 * @param {boolean} [params.isActive=true] - whether the product is active/purchasable
 * @param {string} [params.unit] - product unit, validated if provided
 * @returns {{ valid: boolean, code: string|null, message: string|null }}
 */
const validateOrderQuantity = ({
    quantity,
    minimumOrderQuantity,
    maximumOrderQuantity = null,
    availableStock,
    isActive = true,
    unit
}) => {
    if (unit !== undefined && !isValidUnit(unit)) {
        return { valid: false, code: 'INVALID_UNIT', message: `"${unit}" is not a supported wholesale unit.` };
    }

    if (!isActive) {
        return { valid: false, code: 'PRODUCT_INACTIVE', message: 'This product is not currently available for order.' };
    }

    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || !Number.isInteger(numericQuantity) || numericQuantity <= 0) {
        return { valid: false, code: 'INVALID_QUANTITY', message: 'Quantity must be a whole number greater than 0.' };
    }

    const moq = Number(minimumOrderQuantity);
    if (numericQuantity < moq) {
        return {
            valid: false,
            code: 'BELOW_MOQ',
            message: `Minimum order quantity for this product is ${moq}${unit ? ' ' + unit : ''}.`
        };
    }

    if (maximumOrderQuantity !== null && maximumOrderQuantity !== undefined) {
        const maxQty = Number(maximumOrderQuantity);
        if (numericQuantity > maxQty) {
            return {
                valid: false,
                code: 'ABOVE_MAX_ORDER_QUANTITY',
                message: `Maximum order quantity for this product is ${maxQty}${unit ? ' ' + unit : ''}.`
            };
        }
    }

    const stock = Number(availableStock);
    if (numericQuantity > stock) {
        return {
            valid: false,
            code: 'INSUFFICIENT_STOCK',
            message: `Only ${stock}${unit ? ' ' + unit : ''} available in stock.`
        };
    }

    return { valid: true, code: null, message: null };
};

/**
 * Resolves the effective per-unit price for a given quantity against a
 * sorted-or-unsorted list of wholesale price tiers, falling back to the
 * product's own (discount) price when no tier matches — this is what keeps
 * the existing single-price system working unchanged for products that
 * don't define tiers, per the "do not break the existing product price
 * system unnecessarily" requirement.
 *
 * @param {Object} params
 * @param {number} params.quantity
 * @param {Array<{min_quantity:number, max_quantity:number|null, price:number|string}>} [params.tiers]
 * @param {number} params.fallbackPrice - product.discount_price ?? product.price
 * @returns {{ price: number, tierApplied: Object|null }}
 */
const resolveEffectivePrice = ({ quantity, tiers = [], fallbackPrice }) => {
    const numericQuantity = Number(quantity);

    const matchingTier = (tiers || [])
        .filter((t) => {
            const min = Number(t.min_quantity);
            const max = t.max_quantity === null || t.max_quantity === undefined ? null : Number(t.max_quantity);
            return numericQuantity >= min && (max === null || numericQuantity <= max);
        })
        // If tiers overlap (shouldn't happen, but be defensive), prefer the
        // tier with the highest min_quantity — the most specific match.
        .sort((a, b) => Number(b.min_quantity) - Number(a.min_quantity))[0];

    if (matchingTier) {
        return { price: Number(matchingTier.price), tierApplied: matchingTier };
    }

    return { price: Number(fallbackPrice), tierApplied: null };
};

/**
 * Validates a set of price tiers submitted by the admin: quantities must be
 * positive integers, ranges must not overlap, and at most one tier may be
 * open-ended (max_quantity = null), which — if present — must be the tier
 * covering the highest quantities.
 *
 * @param {Array<{min_quantity:number, max_quantity:number|null, price:number}>} tiers
 * @returns {{ valid: boolean, message: string|null }}
 */
const validatePriceTiers = (tiers) => {
    if (!Array.isArray(tiers) || tiers.length === 0) {
        return { valid: true, message: null };
    }

    const sorted = [...tiers].sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity));

    for (const tier of sorted) {
        const min = Number(tier.min_quantity);
        const max = tier.max_quantity === null || tier.max_quantity === undefined ? null : Number(tier.max_quantity);
        const price = Number(tier.price);

        if (!Number.isInteger(min) || min <= 0) {
            return { valid: false, message: 'Each price tier needs a whole-number minimum quantity greater than 0.' };
        }
        if (max !== null && (!Number.isInteger(max) || max < min)) {
            return { valid: false, message: 'A price tier\'s maximum quantity must be a whole number no smaller than its minimum.' };
        }
        if (!Number.isFinite(price) || price < 0) {
            return { valid: false, message: 'Each price tier needs a non-negative price.' };
        }
    }

    for (let i = 0; i < sorted.length - 1; i += 1) {
        const current = sorted[i];
        const next = sorted[i + 1];
        const currentMax = current.max_quantity === null || current.max_quantity === undefined
            ? Infinity
            : Number(current.max_quantity);
        if (currentMax >= Number(next.min_quantity)) {
            return { valid: false, message: 'Price tier quantity ranges must not overlap.' };
        }
    }

    return { valid: true, message: null };
};

module.exports = {
    validateOrderQuantity,
    resolveEffectivePrice,
    validatePriceTiers
};