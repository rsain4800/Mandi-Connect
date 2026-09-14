/**
 * Phase 4 — Production Inventory System: concurrency & failure-scenario tests.
 *
 * These run the REAL controllers (orderController, paymentController,
 * inventoryController) and the real services/inventoryService against an
 * in-memory fake pool (tests/testDb.js) that implements MySQL's
 * `SELECT ... FOR UPDATE` row locking with genuine async mutexes — so
 * `Promise.all([...])` races here exercise the same lock-based concurrency
 * control the app relies on against a real MySQL server. See testDb.js's
 * header comment for exactly what is (and isn't) modeled.
 *
 * Covers every scenario required by the spec:
 *   1. Two customers ordering the last remaining stock simultaneously
 *   2. Payment failure (bad signature) releases the reservation
 *   3. "Browser closed" — both explicit cancel and passive reservation expiry
 *   4. Duplicate/double-submitted checkout request
 *   5. Duplicate payment callback (idempotent, no double stock decrement)
 *   6. Admin stock adjustment (+/-, with/without a valid reason)
 *   7. Product deactivated while sitting in a customer's cart
 */

'use strict';

const crypto = require('crypto');
const { createFakePool } = require('./testDb');

function mockRes() {
    const res = { statusCode: 200 };
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((body) => { res.body = body; return res; });
    return res;
}

function seedProduct(overrides = {}) {
    return {
        id: 1,
        name: 'Onion',
        sku: 'ONI-1',
        unit: 'kg',
        stock_quantity: 10,
        reserved_stock: 0,
        is_active: 1,
        minimum_order_quantity: 1,
        maximum_order_quantity: 1000,
        price: 100,
        discount_price: null,
        ...overrides
    };
}

function buildPool({ product, users }) {
    const carts = users.map((u, i) => ({ id: i + 1, user_id: u.userId }));
    const cartItems = users.map((u, i) => ({ id: i + 1, cart_id: i + 1, product_id: product.id, quantity: u.qty }));
    // Phase 7 — addresses must resolve as serviceable (Rajasthan + a known
    // pincode) or checkout is correctly rejected before ever reaching the
    // inventory/locking logic these tests exist to exercise. See
    // orderLifecycle.phase6.test.js for the same fixture pattern.
    const addresses = users.map((u) => ({
        id: u.addressId, user_id: u.userId, full_name: 'Test User', phone: '9999999999',
        house_building: 'H1', street: 'S', area: 'A', city: 'C', district: 'Jaipur',
        state: 'Rajasthan', pincode: '311001', landmark: ''
    }));
    const districts = [{ id: 1, name: 'Jaipur', is_active: 1 }];
    const zones = [{ id: 1, name: 'Zone A', shipping_charge: 0, estimated_delivery_days_min: 1, estimated_delivery_days_max: 3, is_active: 1 }];
    const serviceablePincodes = [{
        id: 1, pincode: '311001', city_town: 'Jaipur City', district_id: 1, delivery_zone_id: 1,
        delivery_charge_override: null, min_order_override: null, is_active: 1
    }];
    return createFakePool({
        products: [product],
        addresses,
        carts,
        cartItems,
        priceTiers: [],
        shippingSettings: { id: 1, shipping_charge: 0, free_shipping_threshold: 0 },
        coupons: [],
        districts, zones, serviceablePincodes
    });
}

// Fresh controller instances bound to a fresh fake pool for every test —
// avoids any cross-test state bleed through require()'s module cache.
function loadControllers(fakePool) {
    jest.resetModules();
    jest.doMock('../config/db', () => ({
        pool: fakePool,
        query: fakePool.query,
        initDB: async () => {},
        checkDBConnection: async () => true
    }));
    jest.doMock('../utils/emailService', () => ({
        sendAdminNewOrderEmail: jest.fn(),
        sendCustomerOrderEmail: jest.fn(),
        sendCustomerStatusEmail: jest.fn()
    }));
    return {
        orderController: require('../controllers/orderController'),
        paymentController: require('../controllers/paymentController'),
        inventoryController: require('../controllers/inventoryController'),
        inventoryService: require('../services/inventoryService')
    };
}

const orderReq = (userId, addressId, extra = {}) => ({
    user: { id: userId, full_name: `User ${userId}` },
    body: { address_id: addressId, payment_method: 'cod', ...extra }
});

describe('Scenario 1 — two customers order the last remaining stock simultaneously', () => {
    test('exactly one of two simultaneous orders for the last 5 units succeeds; stock never goes negative', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 5 });
        const fakePool = buildPool({ product, users: [{ userId: 101, addressId: 1, qty: 5 }, { userId: 102, addressId: 2, qty: 5 }] });
        const { orderController } = loadControllers(fakePool);

        const res1 = mockRes();
        const res2 = mockRes();
        await Promise.all([
            orderController.createOrder(orderReq(101, 1), res1),
            orderController.createOrder(orderReq(102, 2), res2)
        ]);

        const results = [res1, res2];
        expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
        expect(results.filter((r) => r.statusCode !== 201)).toHaveLength(1);
        expect(results.find((r) => r.statusCode !== 201).body.success).toBe(false);

        const finalProduct = fakePool.state.products.get(1);
        expect(finalProduct.stock_quantity).toBe(0);
        expect(finalProduct.reserved_stock).toBe(0);
        expect(finalProduct.stock_quantity).toBeGreaterThanOrEqual(0); // never negative

        const sales = fakePool.state.inventoryTransactions.filter((t) => t.transaction_type === 'SALE');
        expect(sales).toHaveLength(1);
        expect(sales[0].quantity).toBe(-5);
        expect(fakePool.state.orders.size).toBe(1); // no order left dangling without stock backing it
    });

    test('ten simultaneous 1-unit orders against 5 units of stock: exactly 5 succeed', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 5, minimum_order_quantity: 1 });
        const users = Array.from({ length: 10 }, (_, i) => ({ userId: 200 + i, addressId: 200 + i, qty: 1 }));
        const fakePool = buildPool({ product, users });
        const { orderController } = loadControllers(fakePool);

        const responses = users.map(() => mockRes());
        await Promise.all(users.map((u, i) => orderController.createOrder(orderReq(u.userId, u.addressId), responses[i])));

        expect(responses.filter((r) => r.statusCode === 201)).toHaveLength(5);
        expect(responses.filter((r) => r.statusCode !== 201)).toHaveLength(5);
        expect(fakePool.state.products.get(1).stock_quantity).toBe(0);
    });
});

describe('Scenario 2 — payment failure releases the reservation', () => {
    test('an invalid Razorpay signature releases held stock and cancels the order', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 10 });
        const fakePool = buildPool({ product, users: [{ userId: 301, addressId: 1, qty: 3 }] });
        const { orderController, paymentController } = loadControllers(fakePool);

        const createRes = mockRes();
        await orderController.createOrder(orderReq(301, 1, { payment_method: 'online' }), createRes);
        expect(createRes.statusCode).toBe(201);
        const orderId = createRes.body.order.id ?? [...fakePool.state.orders.keys()][0];

        expect(fakePool.state.products.get(1).reserved_stock).toBe(3);
        expect(fakePool.state.products.get(1).stock_quantity).toBe(10); // reservation ≠ sale

        // Seed the payments row a real createRazorpayOrder call would have made.
        fakePool.state.payments.set('order_rzp_1', { id: 1, order_id: orderId, razorpay_order_id: 'order_rzp_1', amount: 300, status: 'created' });

        const verifyRes = mockRes();
        await paymentController.verifyPayment({
            user: { id: 301, full_name: 'User 301' },
            body: { razorpay_order_id: 'order_rzp_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'not-a-real-signature', order_id: orderId }
        }, verifyRes);

        expect(verifyRes.statusCode).toBe(400);
        const finalOrder = fakePool.state.orders.get(orderId);
        expect(finalOrder.payment_status).toBe('failed');
        expect(finalOrder.order_status).toBe('Cancelled');

        const finalProduct = fakePool.state.products.get(1);
        expect(finalProduct.reserved_stock).toBe(0);
        expect(finalProduct.stock_quantity).toBe(10); // nothing was ever actually sold

        const releases = fakePool.state.inventoryTransactions.filter((t) => t.transaction_type === 'RELEASE');
        expect(releases).toHaveLength(1);
    });
});

describe('Scenario 3 — "browser closed" mid-checkout', () => {
    test('an explicit cancel before payment releases the reservation immediately', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 10 });
        const fakePool = buildPool({ product, users: [{ userId: 401, addressId: 1, qty: 2 }] });
        const { orderController } = loadControllers(fakePool);

        const createRes = mockRes();
        await orderController.createOrder(orderReq(401, 1, { payment_method: 'online' }), createRes);
        const orderId = [...fakePool.state.orders.keys()][0];
        expect(fakePool.state.products.get(1).reserved_stock).toBe(2);

        const cancelRes = mockRes();
        await orderController.cancelOrder({ user: { id: 401, role: 'customer', full_name: 'User 401' }, params: { id: orderId }, body: {} }, cancelRes);

        expect(cancelRes.statusCode).toBe(200);
        expect(fakePool.state.products.get(1).reserved_stock).toBe(0);
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Cancelled');

        // A second cancel (e.g. both a page-unload beacon and a manual click
        // firing) must be a harmless no-op, not a double-release.
        const secondCancelRes = mockRes();
        await orderController.cancelOrder({ user: { id: 401, role: 'customer', full_name: 'User 401' }, params: { id: orderId }, body: {} }, secondCancelRes);
        expect(secondCancelRes.statusCode).toBe(200);
        expect(fakePool.state.products.get(1).reserved_stock).toBe(0);
    });

    test('a customer who never returns has their reservation swept back to available stock automatically', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 10 });
        const fakePool = buildPool({ product, users: [{ userId: 402, addressId: 1, qty: 4 }] });
        const { orderController, inventoryService } = loadControllers(fakePool);

        const createRes = mockRes();
        await orderController.createOrder(orderReq(402, 1, { payment_method: 'online' }), createRes);
        const orderId = [...fakePool.state.orders.keys()][0];

        // Simulate the reservation window having lapsed (customer closed the
        // browser tab and never completed payment).
        fakePool.state.orders.get(orderId).reservation_expires_at = new Date(Date.now() - 60_000);

        const releasedCount = await inventoryService.releaseExpiredReservations(fakePool, {});

        expect(releasedCount).toBe(1);
        expect(fakePool.state.products.get(1).reserved_stock).toBe(0);
        expect(fakePool.state.products.get(1).stock_quantity).toBe(10);
        expect(fakePool.state.orders.get(orderId).order_status).toBe('Cancelled');
        expect(fakePool.state.orders.get(orderId).payment_status).toBe('failed');
    });
});

describe('Scenario 4 — duplicate/double-submitted checkout request', () => {
    test('firing createOrder twice at once for the same cart only ever creates one order', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 10 });
        const fakePool = buildPool({ product, users: [{ userId: 501, addressId: 1, qty: 3 }] });
        const { orderController } = loadControllers(fakePool);

        const res1 = mockRes();
        const res2 = mockRes();
        await Promise.all([
            orderController.createOrder(orderReq(501, 1), res1),
            orderController.createOrder(orderReq(501, 1), res2)
        ]);

        const results = [res1, res2];
        expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
        expect(results.filter((r) => r.statusCode === 400)).toHaveLength(1);
        expect(results.find((r) => r.statusCode === 400).body.message).toMatch(/cart is empty/i);

        expect(fakePool.state.orders.size).toBe(1);
        expect(fakePool.state.products.get(1).stock_quantity).toBe(7); // decremented exactly once
    });
});

describe('Scenario 5 — duplicate payment callback', () => {
    test('two simultaneous verify calls for the same order only convert the reservation to a sale once', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 10 });
        const fakePool = buildPool({ product, users: [{ userId: 601, addressId: 1, qty: 4 }] });
        const { orderController, paymentController } = loadControllers(fakePool);

        const createRes = mockRes();
        await orderController.createOrder(orderReq(601, 1, { payment_method: 'online' }), createRes);
        const orderId = [...fakePool.state.orders.keys()][0];

        const secret = process.env.RAZORPAY_KEY_SECRET;
        const razorpayOrderId = 'order_rzp_dup';
        const paymentId = 'pay_dup';
        const validSignature = crypto.createHmac('sha256', secret).update(`${razorpayOrderId}|${paymentId}`).digest('hex');
        fakePool.state.payments.set(razorpayOrderId, { id: 1, order_id: orderId, razorpay_order_id: razorpayOrderId, amount: 400, status: 'created' });

        const verifyBody = { razorpay_order_id: razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: validSignature, order_id: orderId };
        const res1 = mockRes();
        const res2 = mockRes();
        await Promise.all([
            paymentController.verifyPayment({ user: { id: 601, full_name: 'User 601' }, body: verifyBody }, res1),
            paymentController.verifyPayment({ user: { id: 601, full_name: 'User 601' }, body: verifyBody }, res2)
        ]);

        expect([res1.statusCode, res2.statusCode]).toEqual([200, 200]);

        const finalProduct = fakePool.state.products.get(1);
        expect(finalProduct.stock_quantity).toBe(6); // 10 - 4, exactly once
        expect(finalProduct.reserved_stock).toBe(0);

        const sales = fakePool.state.inventoryTransactions.filter((t) => t.transaction_type === 'SALE');
        expect(sales).toHaveLength(1);
        expect(sales[0].quantity).toBe(-4);
    });
});

describe('Scenario 6 — admin stock adjustments', () => {
    const adjustReq = (productId, delta, reason, transactionType) => ({
        user: { id: 9001, full_name: 'Admin User' },
        body: { product_id: productId, delta, reason, transaction_type: transactionType }
    });

    test('+100 with a reason logs a PURCHASE and increases stock', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 50 });
        const fakePool = buildPool({ product, users: [] });
        const { inventoryController } = loadControllers(fakePool);

        const res = mockRes();
        await inventoryController.adjustStock(adjustReq(1, 100, 'New stock received'), res);

        expect(res.statusCode).toBe(200);
        expect(fakePool.state.products.get(1).stock_quantity).toBe(150);
        const txn = fakePool.state.inventoryTransactions.at(-1);
        expect(txn.transaction_type).toBe('PURCHASE');
        expect(txn.notes).toBe('New stock received');
    });

    test('-5 with a reason logs an ADJUSTMENT and decreases stock', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 50 });
        const fakePool = buildPool({ product, users: [] });
        const { inventoryController } = loadControllers(fakePool);

        const res = mockRes();
        await inventoryController.adjustStock(adjustReq(1, -5, 'Damaged stock'), res);

        expect(res.statusCode).toBe(200);
        expect(fakePool.state.products.get(1).stock_quantity).toBe(45);
        const txn = fakePool.state.inventoryTransactions.at(-1);
        expect(txn.transaction_type).toBe('ADJUSTMENT');
        expect(txn.notes).toBe('Damaged stock');
    });

    test('rejects an adjustment with no reason', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 50 });
        const fakePool = buildPool({ product, users: [] });
        const { inventoryController } = loadControllers(fakePool);

        const res = mockRes();
        await inventoryController.adjustStock(adjustReq(1, -5, ''), res);

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('REASON_REQUIRED');
        expect(fakePool.state.products.get(1).stock_quantity).toBe(50); // unchanged
    });

    test('rejects an adjustment that would take stock negative', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 5 });
        const fakePool = buildPool({ product, users: [] });
        const { inventoryController } = loadControllers(fakePool);

        const res = mockRes();
        await inventoryController.adjustStock(adjustReq(1, -10, 'Recount'), res);

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('NEGATIVE_STOCK');
        expect(fakePool.state.products.get(1).stock_quantity).toBe(5);
    });

    test('rejects an adjustment that would leave less stock than is currently reserved', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 20, reserved_stock: 15 });
        const fakePool = buildPool({ product, users: [] });
        const { inventoryController } = loadControllers(fakePool);

        const res = mockRes();
        await inventoryController.adjustStock(adjustReq(1, -10, 'Recount'), res);

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('BELOW_RESERVED');
        expect(fakePool.state.products.get(1).stock_quantity).toBe(20);
    });
});

describe('Scenario 7 — product deactivated while sitting in a cart', () => {
    test('checkout re-validates is_active at order time and rejects a deactivated product', async () => {
        const product = seedProduct({ id: 1, stock_quantity: 10, is_active: 1 });
        const fakePool = buildPool({ product, users: [{ userId: 701, addressId: 1, qty: 2 }] });
        const { orderController } = loadControllers(fakePool);

        // Admin deactivates the product (mirrors productController.deleteProduct's
        // `UPDATE products SET is_active = 0`) AFTER it was already added to the cart.
        fakePool.state.products.get(1).is_active = 0;

        const res = mockRes();
        await orderController.createOrder(orderReq(701, 1), res);

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('PRODUCT_INACTIVE');
        expect(fakePool.state.products.get(1).stock_quantity).toBe(10); // untouched
        expect(fakePool.state.orders.size).toBe(0);
        expect(fakePool.state.inventoryTransactions).toHaveLength(0);
    });
});