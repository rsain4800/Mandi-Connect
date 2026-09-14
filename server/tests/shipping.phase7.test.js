/**
 * tests/shipping.phase7.test.js — Phase 7 unit tests for shippingService
 */

'use strict';

const shippingService = require('../services/shippingService');

describe('Shipping Service — Phase 7 Tests', () => {
    describe('isRajasthanState', () => {
        test('validates Rajasthan state variants correctly', () => {
            expect(shippingService.isRajasthanState('Rajasthan')).toBe(true);
            expect(shippingService.isRajasthanState('rajasthan')).toBe(true);
            expect(shippingService.isRajasthanState(' RAJASTHAN ')).toBe(true);
            expect(shippingService.isRajasthanState('Delhi')).toBe(false);
            expect(shippingService.isRajasthanState(null)).toBe(false);
            expect(shippingService.isRajasthanState('')).toBe(false);
        });
    });

    describe('calculateShipping', () => {
        test('calculates standard shipping charge when subtotal below threshold', () => {
            const result = shippingService.calculateShipping({
                subtotal: 300,
                deliveryLocation: {
                    valid: true,
                    zone: { shipping_charge: 50 },
                    min_order_override: null
                },
                shippingSettings: { free_shipping_threshold: 500 }
            });
            expect(result).toEqual({
                shippingCharge: 50,
                meetsMinOrder: true,
                minOrderRequired: 0,
                freeShippingApplied: false
            });
        });

        test('applies free shipping when subtotal meets threshold', () => {
            const result = shippingService.calculateShipping({
                subtotal: 500,
                deliveryLocation: {
                    valid: true,
                    zone: { shipping_charge: 50 },
                    min_order_override: null
                },
                shippingSettings: { free_shipping_threshold: 500 }
            });
            expect(result).toEqual({
                shippingCharge: 0,
                meetsMinOrder: true,
                minOrderRequired: 0,
                freeShippingApplied: true
            });
        });

        test('checks minimum order requirement override', () => {
            const result = shippingService.calculateShipping({
                subtotal: 150,
                deliveryLocation: {
                    valid: true,
                    zone: { shipping_charge: 50 },
                    min_order_override: 200
                },
                shippingSettings: {}
            });
            expect(result.meetsMinOrder).toBe(false);
            expect(result.minOrderRequired).toBe(200);
        });
    });
});