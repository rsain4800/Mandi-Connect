const { validateOrderQuantity, resolveEffectivePrice, validatePriceTiers } = require('../utils/wholesale');
const { toBaseGrams, isValidUnit } = require('../utils/units');

// Product fixture mirroring the spec's example:
//   Onion, Unit: Quintal, MOQ: 5, available_stock: 40
const onion = {
    minimumOrderQuantity: 5,
    maximumOrderQuantity: 50,
    availableStock: 40,
    isActive: true,
    unit: 'quintal'
};

describe('validateOrderQuantity — MOQ enforcement', () => {
    test('valid MOQ (above minimum, within stock) is accepted', () => {
        const result = validateOrderQuantity({ quantity: 10, ...onion });
        expect(result.valid).toBe(true);
    });

    test('below MOQ is rejected', () => {
        const result = validateOrderQuantity({ quantity: 4, ...onion });
        expect(result.valid).toBe(false);
        expect(result.code).toBe('BELOW_MOQ');
    });

    test('exact MOQ is accepted (boundary is inclusive)', () => {
        const result = validateOrderQuantity({ quantity: 5, ...onion });
        expect(result.valid).toBe(true);
    });

    test('above MOQ but within stock and max is accepted', () => {
        const result = validateOrderQuantity({ quantity: 20, ...onion });
        expect(result.valid).toBe(true);
    });

    test('above maximum_order_quantity is rejected', () => {
        const result = validateOrderQuantity({ quantity: 51, ...onion });
        expect(result.valid).toBe(false);
        expect(result.code).toBe('ABOVE_MAX_ORDER_QUANTITY');
    });

    test('insufficient stock is rejected even if above MOQ and below max', () => {
        const result = validateOrderQuantity({ quantity: 41, ...onion });
        expect(result.valid).toBe(false);
        expect(result.code).toBe('INSUFFICIENT_STOCK');
    });

    test('exact available stock is accepted', () => {
        const result = validateOrderQuantity({ quantity: 40, ...onion });
        expect(result.valid).toBe(true);
    });

    test('inactive product is rejected regardless of quantity', () => {
        const result = validateOrderQuantity({ quantity: 10, ...onion, isActive: false });
        expect(result.valid).toBe(false);
        expect(result.code).toBe('PRODUCT_INACTIVE');
    });

    test('invalid unit is rejected', () => {
        const result = validateOrderQuantity({ quantity: 10, ...onion, unit: 'litre' });
        expect(result.valid).toBe(false);
        expect(result.code).toBe('INVALID_UNIT');
    });

    test.each([0, -5, 2.5, NaN, 'abc'])('invalid quantity (%p) is rejected', (badQty) => {
        const result = validateOrderQuantity({ quantity: badQty, ...onion });
        expect(result.valid).toBe(false);
        expect(result.code).toBe('INVALID_QUANTITY');
    });

    test('product with no maximum_order_quantity has no upper bound besides stock', () => {
        const result = validateOrderQuantity({
            quantity: 1000000,
            minimumOrderQuantity: 5,
            maximumOrderQuantity: null,
            availableStock: 1000000,
            isActive: true,
            unit: 'kg'
        });
        expect(result.valid).toBe(true);
    });
});

describe('resolveEffectivePrice — wholesale price tier calculation', () => {
    // Spec example: 5–20 quintal = ₹2000, 21–50 quintal = ₹1800, 51+ quintal = ₹1600
    const tiers = [
        { min_quantity: 5, max_quantity: 20, price: 2000 },
        { min_quantity: 21, max_quantity: 50, price: 1800 },
        { min_quantity: 51, max_quantity: null, price: 1600 }
    ];

    test('quantity within first tier uses that tier price', () => {
        const { price, tierApplied } = resolveEffectivePrice({ quantity: 10, tiers, fallbackPrice: 2500 });
        expect(price).toBe(2000);
        expect(tierApplied).not.toBeNull();
    });

    test('quantity at first tier lower boundary uses that tier', () => {
        expect(resolveEffectivePrice({ quantity: 5, tiers, fallbackPrice: 2500 }).price).toBe(2000);
    });

    test('quantity at first tier upper boundary still uses that tier', () => {
        expect(resolveEffectivePrice({ quantity: 20, tiers, fallbackPrice: 2500 }).price).toBe(2000);
    });

    test('quantity just above first tier boundary rolls into second tier', () => {
        expect(resolveEffectivePrice({ quantity: 21, tiers, fallbackPrice: 2500 }).price).toBe(1800);
    });

    test('quantity in open-ended top tier (51+) uses that tier price', () => {
        expect(resolveEffectivePrice({ quantity: 200, tiers, fallbackPrice: 2500 }).price).toBe(1600);
    });

    test('quantity below any tier falls back to product price', () => {
        const { price, tierApplied } = resolveEffectivePrice({ quantity: 2, tiers, fallbackPrice: 2500 });
        expect(price).toBe(2500);
        expect(tierApplied).toBeNull();
    });

    test('product with no tiers always uses fallback price', () => {
        const { price, tierApplied } = resolveEffectivePrice({ quantity: 100, tiers: [], fallbackPrice: 35 });
        expect(price).toBe(35);
        expect(tierApplied).toBeNull();
    });
});

describe('validatePriceTiers — admin input validation', () => {
    test('accepts empty/undefined tiers (product uses flat pricing)', () => {
        expect(validatePriceTiers([]).valid).toBe(true);
        expect(validatePriceTiers(undefined).valid).toBe(true);
    });

    test('accepts well-formed non-overlapping tiers', () => {
        const tiers = [
            { min_quantity: 5, max_quantity: 20, price: 2000 },
            { min_quantity: 21, max_quantity: 50, price: 1800 },
            { min_quantity: 51, max_quantity: null, price: 1600 }
        ];
        expect(validatePriceTiers(tiers).valid).toBe(true);
    });

    test('rejects overlapping tiers', () => {
        const tiers = [
            { min_quantity: 5, max_quantity: 21, price: 2000 },
            { min_quantity: 21, max_quantity: 50, price: 1800 }
        ];
        expect(validatePriceTiers(tiers).valid).toBe(false);
    });

    test('rejects a tier with negative price', () => {
        const tiers = [{ min_quantity: 5, max_quantity: 20, price: -1 }];
        expect(validatePriceTiers(tiers).valid).toBe(false);
    });

    test('rejects a tier whose max is below its min', () => {
        const tiers = [{ min_quantity: 20, max_quantity: 5, price: 100 }];
        expect(validatePriceTiers(tiers).valid).toBe(false);
    });
});

describe('units.js — base-unit (gram) conversion, integer-safe', () => {
    test('1 quintal = 100 kg, exactly, in grams', () => {
        expect(toBaseGrams(1, 'quintal')).toBe(toBaseGrams(100, 'kg'));
    });

    test('1 ton = 1000 kg, exactly, in grams', () => {
        expect(toBaseGrams(1, 'ton')).toBe(toBaseGrams(1000, 'kg'));
    });

    test('conversions stay integers (no floating point drift) across many additions', () => {
        let totalGrams = 0;
        for (let i = 0; i < 1000; i += 1) {
            totalGrams += toBaseGrams(0.1, 'kg'); // 100g each time, as an integer
        }
        expect(totalGrams).toBe(100000); // exactly 100kg, not 99999.999999...
        expect(Number.isInteger(totalGrams)).toBe(true);
    });

    test('count-based units (piece, dozen, bag, crate, box) are not weight-convertible', () => {
        expect(toBaseGrams(5, 'piece')).toBeNull();
        expect(toBaseGrams(5, 'bag')).toBeNull();
    });

    test('isValidUnit recognises all wholesale units', () => {
        ['kg', 'gram', 'quintal', 'ton', 'bag', 'crate', 'box', 'piece', 'dozen'].forEach((u) => {
            expect(isValidUnit(u)).toBe(true);
        });
        expect(isValidUnit('litre')).toBe(false);
        expect(isValidUnit('')).toBe(false);
    });
});