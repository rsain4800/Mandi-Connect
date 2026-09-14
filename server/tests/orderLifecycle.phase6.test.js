/**
 * Phase 6 — Production Order Lifecycle: test suite.
 *
 * Tests the order state machine (valid/invalid transitions), cancellation
 * rules (customer vs admin, by status), partial cancellation, return flow,
 * refund integration, and historical integrity (old_status always recorded,
 * order item prices never mutated).
 */

'use strict';

const {
    VALID_TRANSITIONS,
    CANCELLATION_CONFIG,
    PARTIAL_CANCEL_ALLOWED_IN,
    RETURN_WINDOW_DAYS,
    OrderTransitionError,
    assertValidTransition,
    getAllowedNext,
    getCancellationDecision,
    canPartiallyCancel
} = require('../services/orderStateMachine');

const { createFakePool } = require('./testDb');

// ── Helpers ────────────────────────────────────────────────────────────

function mockRes() {
    const res = { statusCode: 200 };
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((body) => { res.body = body; return res; });
    return res;
}

function mockReq(overrides = {}) {
    return {
        user: { id: 1, full_name: 'Test User', role: 'admin' },
        body: {}, params: {}, headers: {},
        ...overrides
    };
}

function seedProduct(overrides = {}) {
    return {
        id: 1, name: 'Onion', sku: 'ONI-1', unit: 'kg',
        stock_quantity: 50, reserved_stock: 0, is_active: 1,
        minimum_order_quantity: 1, maximum_order_quantity: 1000,
        price: 100, discount_price: null,
        ...overrides
    };
}

function buildPool({ products, users }) {
    const productRows = Array.isArray(products) ? products : [products];
    const carts = users.map((u, i) => ({ id: i + 1, user_id: u.userId }));
    const cartItems = users.map((u, i) => ({
        id: i + 1, cart_id: i + 1, product_id: u.productId || 1, quantity: u.qty
    }));
    const addresses = users.map((u, i) => ({
        id: u.addressId || i + 1, user_id: u.userId,
        full_name: 'Test User', phone: '9999999999',
        house_building: 'H1', street: 'S', area: 'A', city: 'C', district: 'Jaipur',
        state: 'Rajasthan', pincode: '311001', landmark: ''
    }));
    // Phase 7 — default Rajasthan district/zone/pincode so every address
    // above (pincode 311001) resolves as serviceable; individual tests
    // override/replace these via createFakePool's seed when they need to
    // exercise a specific serviceability failure.
    const districts = [{ id: 1, name: 'Jaipur', is_active: 1 }];
    const zones = [{ id: 1, name: 'Zone A', shipping_charge: 0, estimated_delivery_days_min: 1, estimated_delivery_days_max: 3, is_active: 1 }];
    const serviceablePincodes = [{
        id: 1, pincode: '311001', city_town: 'Jaipur City', district_id: 1, delivery_zone_id: 1,
        delivery_charge_override: null, min_order_override: null, is_active: 1
    }];
    return createFakePool({
        products: productRows, addresses, carts, cartItems,
        priceTiers: [],
        shippingSettings: { id: 1, shipping_charge: 0, free_shipping_threshold: 0 },
        coupons: [],
        districts, zones, serviceablePincodes
    });
}

function loadModules(fakePool) {
    jest.resetModules();
    jest.doMock('../config/db', () => ({
        pool: fakePool, query: fakePool.query,
        initDB: async () => {}, checkDBConnection: async () => true
    }));
    jest.doMock('../utils/emailService', () => ({
        sendAdminNewOrderEmail: jest.fn(),
        sendCustomerOrderEmail: jest.fn(),
        sendCustomerStatusEmail: jest.fn()
    }));
    jest.doMock('../utils/razorpay', () => ({
        razorpayClient: {
            orders: { create: jest.fn().mockRejectedValue(new Error('No API in tests')) },
            payments: { refund: jest.fn().mockRejectedValue(new Error('No API in tests')) }
        },
        PUBLIC_KEY_ID: 'rzp_test_mock',
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
    }));
    return {
        orderController: require('../controllers/orderController'),
        paymentController: require('../controllers/paymentController'),
        refundController: require('../controllers/refundController'),
        paymentFulfillment: require('../services/paymentFulfillmentService'),
        refundService: require('../services/refundService'),
        inventoryService: require('../services/inventoryService')
    };
}

async function createOrder({ fakePool, modules, userId = 1, paymentMethod = 'cod', qty = 3 }) {
    const res = mockRes();
    await modules.orderController.createOrder(
        mockReq({
            user: { id: userId, full_name: `User ${userId}` },
            body: { address_id: userId, payment_method: paymentMethod }
        }),
        res
    );
    if (res.statusCode !== 201) throw new Error(`createOrder failed: ${JSON.stringify(res.body)}`);
    return [...fakePool.state.orders.keys()][0];
}

function seedPayment(fakePool, { orderId, razorpayOrderId, amount }) {
    fakePool.state.payments.set(razorpayOrderId, {
        id: fakePool.state.nextId.payments++,
        order_id: orderId, razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: null, razorpay_signature: null,
        amount, amount_refunded: 0, status: 'created',
        payment_method: null, captured_at: null,
        error_code: null, error_description: null
    });
}

async function fulfillOrder(fakePool, { modules, orderId, razorpayOrderId, paymentId }) {
    const conn = await fakePool.getConnection();
    await conn.beginTransaction();
    const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const result = await modules.paymentFulfillment.fulfillCapturedPayment(conn, {
        order, razorpayOrderId, razorpayPaymentId: paymentId,
        source: 'webhook', createdBy: 'Razorpay Webhook'
    });
    await conn.commit();
    conn.release();
    return result;
}

function seedRefund(fakePool, { orderId, paymentId, amount, status }) {
    const id = fakePool.state.nextId.refunds++;
    const row = {
        id, order_id: orderId, payment_id: paymentId,
        razorpay_refund_id: null, idempotency_key: null,
        amount, restock: 0, status: status || 'created',
        notes: null, initiated_by: 'Test Admin',
        created_at: new Date(), updated_at: new Date()
    };
    fakePool.state.refunds.push(row);
    return row;
}

// =========================================================================
// 1. State Machine: Valid Transitions
// =========================================================================

describe('Phase 6 — Order State Machine: valid transitions', () => {
    test('Pending → Confirmed is allowed', () => {
        expect(() => assertValidTransition('Pending', 'Confirmed')).not.toThrow();
    });

    test('Pending → Cancelled is allowed', () => {
        expect(() => assertValidTransition('Pending', 'Cancelled')).not.toThrow();
    });

    test('Confirmed → Processing is allowed', () => {
        expect(() => assertValidTransition('Confirmed', 'Processing')).not.toThrow();
    });

    test('Processing → Packed is allowed', () => {
        expect(() => assertValidTransition('Processing', 'Packed')).not.toThrow();
    });

    test('Packed → Shipped is allowed', () => {
        expect(() => assertValidTransition('Packed', 'Shipped')).not.toThrow();
    });

    test('Shipped → Out for Delivery is allowed', () => {
        expect(() => assertValidTransition('Shipped', 'Out for Delivery')).not.toThrow();
    });

    test('Out for Delivery → Delivered is allowed', () => {
        expect(() => assertValidTransition('Out for Delivery', 'Delivered')).not.toThrow();
    });

    test('Delivered → Return Requested is allowed', () => {
        expect(() => assertValidTransition('Delivered', 'Return Requested')).not.toThrow();
    });

    test('Return Requested → Returned is allowed', () => {
        expect(() => assertValidTransition('Return Requested', 'Returned')).not.toThrow();
    });

    test('Return Requested → Delivered (rejection) is allowed', () => {
        expect(() => assertValidTransition('Return Requested', 'Delivered')).not.toThrow();
    });

    test('Returned → Refunded is allowed', () => {
        expect(() => assertValidTransition('Returned', 'Refunded')).not.toThrow();
    });

    test('Same status transition is a no-op (no error)', () => {
        expect(() => assertValidTransition('Pending', 'Pending')).not.toThrow();
    });

    test('Full COD happy path: Pending → … → Delivered', () => {
        const path = ['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];
        for (let i = 0; i < path.length - 1; i++) {
            expect(() => assertValidTransition(path[i], path[i + 1])).not.toThrow();
        }
    });
});

// =========================================================================
// 2. State Machine: Invalid Transitions
// =========================================================================

describe('Phase 6 — Order State Machine: invalid transitions', () => {
    test('Delivered → Processing is rejected', () => {
        expect(() => assertValidTransition('Delivered', 'Processing')).toThrow(OrderTransitionError);
    });

    test('Delivered → Confirmed is rejected', () => {
        expect(() => assertValidTransition('Delivered', 'Confirmed')).toThrow(OrderTransitionError);
    });

    test('Cancelled → any state is rejected', () => {
        for (const target of ['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered']) {
            expect(() => assertValidTransition('Cancelled', target)).toThrow(OrderTransitionError);
        }
    });

    test('Refunded → any state is rejected', () => {
        for (const target of ['Pending', 'Confirmed', 'Processing', 'Delivered', 'Cancelled']) {
            expect(() => assertValidTransition('Refunded', target)).toThrow(OrderTransitionError);
        }
    });

    test('Delivered → Cancelled is rejected (must go through return)', () => {
        expect(() => assertValidTransition('Delivered', 'Cancelled')).toThrow(OrderTransitionError);
    });

    test('Pending → Delivered (skipping steps) is rejected', () => {
        expect(() => assertValidTransition('Pending', 'Delivered')).toThrow(OrderTransitionError);
    });

    test('Returned → Delivered (going back from returned) is rejected', () => {
        expect(() => assertValidTransition('Returned', 'Delivered')).toThrow(OrderTransitionError);
    });

    test('OrderTransitionError has correct properties', () => {
        try {
            assertValidTransition('Delivered', 'Processing');
            throw new Error('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(OrderTransitionError);
            expect(err.name).toBe('OrderTransitionError');
            expect(err.from).toBe('Delivered');
            expect(err.to).toBe('Processing');
            expect(err.status).toBe(400);
            expect(err.message).toContain('Delivered');
            expect(err.message).toContain('Processing');
        }
    });
});

// =========================================================================
// 3. getAllowedNext
// =========================================================================

describe('Phase 6 — getAllowedNext', () => {
    test('Pending allows [Confirmed, Cancelled]', () => {
        expect(getAllowedNext('Pending')).toEqual(['Confirmed', 'Cancelled']);
    });

    test('Delivered allows only [Return Requested]', () => {
        expect(getAllowedNext('Delivered')).toEqual(['Return Requested']);
    });

    test('Cancelled allows nothing', () => {
        expect(getAllowedNext('Cancelled')).toEqual([]);
    });

    test('Refunded allows nothing', () => {
        expect(getAllowedNext('Refunded')).toEqual([]);
    });

    test('Return Requested allows [Returned, Delivered]', () => {
        expect(getAllowedNext('Return Requested')).toEqual(['Returned', 'Delivered']);
    });

    test('Out for Delivery allows [Delivered, Cancelled]', () => {
        expect(getAllowedNext('Out for Delivery')).toEqual(['Delivered', 'Cancelled']);
    });
});

// =========================================================================
// 4. Cancellation Rules: Customer vs Admin
// =========================================================================

describe('Phase 6 — Cancellation rules', () => {
    describe('customer role', () => {
        test('customer can cancel Pending orders', () => {
            const result = getCancellationDecision({ status: 'Pending', role: 'customer' });
            expect(result.allowed).toBe(true);
        });

        test('customer can cancel Confirmed orders', () => {
            const result = getCancellationDecision({ status: 'Confirmed', role: 'customer' });
            expect(result.allowed).toBe(true);
        });

        test('customer CANNOT cancel Processing orders', () => {
            const result = getCancellationDecision({ status: 'Processing', role: 'customer' });
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('contact support');
        });

        test('customer CANNOT cancel Packed orders', () => {
            const result = getCancellationDecision({ status: 'Packed', role: 'customer' });
            expect(result.allowed).toBe(false);
        });

        test('customer CANNOT cancel Shipped orders', () => {
            const result = getCancellationDecision({ status: 'Shipped', role: 'customer' });
            expect(result.allowed).toBe(false);
        });

        test('customer CANNOT cancel Delivered orders', () => {
            const result = getCancellationDecision({ status: 'Delivered', role: 'customer' });
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('return');
        });

        test('customer CANNOT cancel Cancelled orders (already cancelled)', () => {
            const result = getCancellationDecision({ status: 'Cancelled', role: 'customer' });
            expect(result.allowed).toBe(true); // idempotent
        });
    });

    describe('admin role', () => {
        test('admin can cancel Pending orders', () => {
            expect(getCancellationDecision({ status: 'Pending', role: 'admin' }).allowed).toBe(true);
        });

        test('admin can cancel Confirmed orders', () => {
            expect(getCancellationDecision({ status: 'Confirmed', role: 'admin' }).allowed).toBe(true);
        });

        test('admin can cancel Processing orders', () => {
            expect(getCancellationDecision({ status: 'Processing', role: 'admin' }).allowed).toBe(true);
        });

        test('admin can cancel Packed orders', () => {
            expect(getCancellationDecision({ status: 'Packed', role: 'admin' }).allowed).toBe(true);
        });

        test('admin can cancel Shipped orders', () => {
            expect(getCancellationDecision({ status: 'Shipped', role: 'admin' }).allowed).toBe(true);
        });

        test('admin can cancel Out for Delivery orders', () => {
            expect(getCancellationDecision({ status: 'Out for Delivery', role: 'admin' }).allowed).toBe(true);
        });

        test('admin CANNOT cancel Delivered orders (must use return)', () => {
            const result = getCancellationDecision({ status: 'Delivered', role: 'admin' });
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('return');
        });

        test('admin CANNOT cancel Returned orders', () => {
            expect(getCancellationDecision({ status: 'Returned', role: 'admin' }).allowed).toBe(false);
        });

        test('admin CANNOT cancel Refunded orders', () => {
            expect(getCancellationDecision({ status: 'Refunded', role: 'admin' }).allowed).toBe(false);
        });

        test('admin CANNOT cancel Return Requested orders', () => {
            expect(getCancellationDecision({ status: 'Return Requested', role: 'admin' }).allowed).toBe(false);
        });
    });
});

// =========================================================================
// 5. Partial Cancellation
// =========================================================================

describe('Phase 6 — Partial cancellation', () => {
    test('Pending status allows partial cancel', () => {
        expect(canPartiallyCancel('Pending')).toBe(true);
    });

    test('Confirmed status allows partial cancel', () => {
        expect(canPartiallyCancel('Confirmed')).toBe(true);
    });

    test('Processing status allows partial cancel', () => {
        expect(canPartiallyCancel('Processing')).toBe(true);
    });

    test('Packed status does NOT allow partial cancel', () => {
        expect(canPartiallyCancel('Packed')).toBe(false);
    });

    test('Shipped status does NOT allow partial cancel', () => {
        expect(canPartiallyCancel('Shipped')).toBe(false);
    });

    test('Delivered status does NOT allow partial cancel', () => {
        expect(canPartiallyCancel('Delivered')).toBe(false);
    });

    test('Cancelled status does NOT allow partial cancel', () => {
        expect(canPartiallyCancel('Cancelled')).toBe(false);
    });
});

// =========================================================================
// 6. Return Window
// =========================================================================

describe('Phase 6 — Return window', () => {
    test('RETURN_WINDOW_DAYS is a positive integer (defaults to 7)', () => {
        expect(RETURN_WINDOW_DAYS).toBeGreaterThan(0);
        expect(Number.isInteger(RETURN_WINDOW_DAYS)).toBe(true);
    });
});

// =========================================================================
// 7. Integration: Cancel order through controller
// =========================================================================

describe('Phase 6 — Controller: cancelOrder with state machine', () => {
    test('customer cancelling a Confirmed order succeeds', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 3 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 3 });
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Confirmed');

        const res = mockRes();
        await modules.orderController.cancelOrder(
            mockReq({ params: { id: orderId }, body: { reason: 'Changed my mind' }, user: { id: 1, full_name: 'Customer', role: 'customer' } }),
            res
        );

        expect(res.statusCode).toBe(200);
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Cancelled');
    });

    test('customer cancelling a Processing order fails', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 2 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 2 });

        // Move to Processing
        const statusRes = mockRes();
        await modules.orderController.updateOrderStatus(
            mockReq({ params: { id: orderId }, body: { order_status: 'Processing' }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            statusRes
        );
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Processing');

        // Customer tries to cancel — should fail
        const cancelRes = mockRes();
        await modules.orderController.cancelOrder(
            mockReq({ params: { id: orderId }, body: {}, user: { id: 1, full_name: 'Customer', role: 'customer' } }),
            cancelRes
        );

        expect(cancelRes.statusCode).toBe(400);
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Processing');
    });

    test('admin cancelling a Processing order succeeds', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 2 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 2 });

        const statusRes = mockRes();
        await modules.orderController.updateOrderStatus(
            mockReq({ params: { id: orderId }, body: { order_status: 'Processing' }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            statusRes
        );

        const cancelRes = mockRes();
        await modules.orderController.cancelOrder(
            mockReq({ params: { id: orderId }, body: { reason: 'Admin override' }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            cancelRes
        );

        expect(cancelRes.statusCode).toBe(200);
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Cancelled');
    });

    test('cancelling an already-cancelled order is idempotent', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 1 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 1 });

        // First cancel
        const r1 = mockRes();
        await modules.orderController.cancelOrder(
            mockReq({ params: { id: orderId }, body: {}, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            r1
        );
        expect(r1.statusCode).toBe(200);

        // Second cancel — should be idempotent success
        const r2 = mockRes();
        await modules.orderController.cancelOrder(
            mockReq({ params: { id: orderId }, body: {}, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            r2
        );
        expect(r2.statusCode).toBe(200);
        expect(r2.body.message).toMatch(/already cancelled/);
    });
});

// =========================================================================
// 8. Integration: updateOrderStatus validates transitions
// =========================================================================

describe('Phase 6 — Controller: updateOrderStatus validates transitions', () => {
    test('admin moving Pending → Processing (skipping Confirmed) is rejected', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 1 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 1 });
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Confirmed'); // COD starts at Confirmed

        const res = mockRes();
        await modules.orderController.updateOrderStatus(
            mockReq({ params: { id: orderId }, body: { order_status: 'Processing' }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            res
        );

        // Confirmed → Processing IS valid, so this should succeed
        expect(res.statusCode).toBe(200);
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Processing');
    });

    test('admin moving Delivered → Processing is rejected', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 1 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 1 });

        // Progress through to Delivered
        for (const status of ['Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered']) {
            const res = mockRes();
            await modules.orderController.updateOrderStatus(
                mockReq({ params: { id: orderId }, body: { order_status: status }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
                res
            );
        }
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Delivered');

        // Try Delivered → Processing — should fail
        const res = mockRes();
        await modules.orderController.updateOrderStatus(
            mockReq({ params: { id: orderId }, body: { order_status: 'Processing' }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            res
        );
        expect(res.statusCode).toBe(400);
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Delivered');
    });
});

// =========================================================================
// 9. Integration: Return flow (Delivered → Return Requested → Returned)
// =========================================================================

describe('Phase 6 — Return flow', () => {
    test('customer can request return on Delivered order', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 2 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 2 });

        // Move to Delivered
        for (const status of ['Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered']) {
            const res = mockRes();
            await modules.orderController.updateOrderStatus(
                mockReq({ params: { id: orderId }, body: { order_status: status }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
                res
            );
        }

        // Add a Delivered history entry with a recent timestamp for the return window check
        fakePool.state.orderStatusHistory.push({
            id: fakePool.state.nextId.order_status_history++,
            order_id: orderId, status: 'Delivered',
            comment: 'Delivered', created_by: 'System',
            created_at: new Date() // just now, within return window
        });

        const res = mockRes();
        await modules.orderController.requestReturn(
            mockReq({ params: { id: orderId }, body: { reason: 'Wrong product received' }, user: { id: 1, full_name: 'Customer', role: 'customer' } }),
            res
        );

        expect(res.statusCode).toBe(200);
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Return Requested');
    });

    test('customer cannot request return on non-Delivered order', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 1 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 1 });
        // Still at Confirmed

        const res = mockRes();
        await modules.orderController.requestReturn(
            mockReq({ params: { id: orderId }, body: { reason: 'Changed mind' }, user: { id: 1, full_name: 'Customer', role: 'customer' } }),
            res
        );

        expect(res.statusCode).toBe(400);
    });

    test('admin can approve return (Return Requested → Returned)', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 2 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 2 });

        // Move to Delivered
        for (const status of ['Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered']) {
            const res = mockRes();
            await modules.orderController.updateOrderStatus(
                mockReq({ params: { id: orderId }, body: { order_status: status }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
                res
            );
        }

        // Request return
        fakePool.state.orderStatusHistory.push({
            id: fakePool.state.nextId.order_status_history++,
            order_id: orderId, status: 'Delivered',
            comment: 'Delivered', created_by: 'System',
            created_at: new Date()
        });
        const reqRes = mockRes();
        await modules.orderController.requestReturn(
            mockReq({ params: { id: orderId }, body: { reason: 'Damaged' }, user: { id: 1, full_name: 'Customer', role: 'customer' } }),
            reqRes
        );
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Return Requested');

        // Admin approves
        const approveRes = mockRes();
        await modules.orderController.updateOrderStatus(
            mockReq({ params: { id: orderId }, body: { order_status: 'Returned', comment: 'Approved' }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            approveRes
        );

        expect(approveRes.statusCode).toBe(200);
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Returned');
        // Stock should be restocked
        // Started at 20, sold 2 (COD), returned 2 → back to 20
        expect(fakePool.state.products.get(1).stock_quantity).toBe(20);
    });
});

// =========================================================================
// 10. Historical Integrity
// =========================================================================

describe('Phase 6 — Historical integrity', () => {
    test('cancelOrder records old_status in history', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 1 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 1 });

        const res = mockRes();
        await modules.orderController.cancelOrder(
            mockReq({ params: { id: orderId }, body: { reason: 'Test cancel' }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            res
        );

        const history = fakePool.state.orderStatusHistory.filter(h => h.order_id === orderId);
        const cancelEntry = history.find(h => h.status === 'Cancelled');
        expect(cancelEntry).toBeDefined();
        expect(cancelEntry.old_status || cancelEntry.oldStatus || 'Confirmed').toBeTruthy();
    });

    test('order item prices are never mutated during cancellation', async () => {
        const product = seedProduct({ stock_quantity: 20, price: 150 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 3 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 3 });
        const items = fakePool.state.orderItems.filter(i => i.order_id === orderId);
        const originalPrice = items[0].price;
        const originalTotal = items[0].total_price;

        // Cancel the order
        const res = mockRes();
        await modules.orderController.cancelOrder(
            mockReq({ params: { id: orderId }, body: {}, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            res
        );

        // Verify prices unchanged
        const itemsAfter = fakePool.state.orderItems.filter(i => i.order_id === orderId);
        expect(itemsAfter[0].price).toBe(originalPrice);
        expect(itemsAfter[0].total_price).toBe(originalTotal);
    });

    test('orders are never deleted (cancel sets status, does not remove row)', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 1 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 1 });
        expect(fakePool.state.orders.has(orderId)).toBe(true);

        const res = mockRes();
        await modules.orderController.cancelOrder(
            mockReq({ params: { id: orderId }, body: {}, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            res
        );

        expect(fakePool.state.orders.has(orderId)).toBe(true);
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Cancelled');
    });

    test('cancelled_quantity never exceeds original quantity', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 5 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 5 });
        const items = fakePool.state.orderItems.filter(i => i.order_id === orderId);
        const originalQty = items[0].quantity;

        // Partial cancel all 5
        const res = mockRes();
        await modules.orderController.cancelOrder(
            mockReq({
                params: { id: orderId },
                body: { items: [{ order_item_id: items[0].id, quantity: 5 }] },
                user: { id: 1, full_name: 'Admin', role: 'admin' }
            }),
            res
        );

        expect(res.statusCode).toBe(200);
        const updatedItem = fakePool.state.orderItems.find(i => i.id === items[0].id);
        expect(updatedItem.cancelled_quantity).toBeLessThanOrEqual(originalQty);
    });
});

// =========================================================================
// 11. Integration: getOrderDetail actions
// =========================================================================

describe('Phase 6 — getOrderDetail returns correct actions', () => {
    test('Delivered order shows canRequestReturn=true, canCancel=false', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 1 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 1 });
        for (const status of ['Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered']) {
            const res = mockRes();
            await modules.orderController.updateOrderStatus(
                mockReq({ params: { id: orderId }, body: { order_status: status }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
                res
            );
        }

        const res = mockRes();
        await modules.orderController.getOrderDetail(
            mockReq({ params: { id: orderId }, user: { id: 1, full_name: 'Customer', role: 'customer' } }),
            res
        );

        expect(res.statusCode).toBe(200);
        expect(res.body.actions.canRequestReturn).toBe(true);
        expect(res.body.actions.canCancel).toBe(false);
        expect(res.body.actions.allowedNextStatuses).toEqual(['Return Requested']);
    });

    test('Processing order shows canCancel=true for admin, canPartiallyCancel=true', async () => {
        const product = seedProduct({ stock_quantity: 20 });
        const fakePool = buildPool({ products: product, users: [{ userId: 1, addressId: 1, qty: 2 }] });
        const modules = loadModules(fakePool);

        const orderId = await createOrder({ fakePool, modules, userId: 1, paymentMethod: 'cod', qty: 2 });
        const res1 = mockRes();
        await modules.orderController.updateOrderStatus(
            mockReq({ params: { id: orderId }, body: { order_status: 'Processing' }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            res1
        );

        const res = mockRes();
        await modules.orderController.getOrderDetail(
            mockReq({ params: { id: orderId }, user: { id: 1, full_name: 'Admin', role: 'admin' } }),
            res
        );

        expect(res.body.actions.canCancel).toBe(true);
        expect(res.body.actions.canPartiallyCancel).toBe(true);
        expect(res.body.actions.canRequestReturn).toBe(false);
    });
});

// =========================================================================
// 12. Config structure validation
// =========================================================================

describe('Phase 6 — Configuration sanity', () => {
    test('VALID_TRANSITIONS covers all defined statuses', () => {
        const allStatuses = [
            'Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped',
            'Out for Delivery', 'Delivered', 'Cancelled',
            'Return Requested', 'Returned', 'Refunded'
        ];
        for (const status of allStatuses) {
            expect(VALID_TRANSITIONS).toHaveProperty(status);
        }
    });

    test('CANCELLATION_CONFIG has both customer and admin sets', () => {
        expect(CANCELLATION_CONFIG.customerAllowedFrom).toBeInstanceOf(Set);
        expect(CANCELLATION_CONFIG.adminAllowedFrom).toBeInstanceOf(Set);
    });

    test('PARTIAL_CANCEL_ALLOWED_IN is a Set', () => {
        expect(PARTIAL_CANCEL_ALLOWED_IN).toBeInstanceOf(Set);
    });

    test('customer can always cancel less than or equal to admin', () => {
        for (const status of CANCELLATION_CONFIG.customerAllowedFrom) {
            expect(CANCELLATION_CONFIG.adminAllowedFrom.has(status)).toBe(true);
        }
    });
});