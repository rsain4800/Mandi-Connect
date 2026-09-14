/**
 * tests/testDb.js — an in-memory, mysql2/promise-shaped fake pool used to
 * exercise the REAL controller/service code (orderController, paymentController,
 * inventoryController, services/inventoryService) under genuine concurrency,
 * without needing a live MySQL server (not available in this sandbox/CI step).
 *
 * Why this exists instead of mocking inventoryService directly: the whole
 * point of Phase 4 is that concurrency safety comes from row-level locking
 * (`SELECT ... FOR UPDATE`) plus everything happening inside one DB
 * transaction. A test that mocks inventoryService's functions can't prove
 * that guarantee — it would just be testing whatever the mock says. This
 * harness instead implements the small, *exact* set of SQL statements these
 * controllers issue (enumerated by grep against orderController.js,
 * paymentController.js, inventoryController.js and services/inventoryService.js)
 * against real in-memory tables, with a real per-row async mutex standing in
 * for InnoDB's row lock — held from the `FOR UPDATE` SELECT until COMMIT/
 * ROLLBACK, exactly like a real transaction. Two "connections" awaiting the
 * same mutex genuinely interleave on Node's event loop, so `Promise.all([...])`
 * in a test reproduces the same race a real load test against MySQL would.
 *
 * Simplifications (documented, not hidden — see "Remaining risks" in the
 * project write-up):
 *   - No MVCC/undo log: a write becomes visible to the in-memory tables the
 *     moment its UPDATE/INSERT statement runs, not just at COMMIT. This is
 *     safe for these tests because the row lock already prevents any other
 *     connection from reading that row concurrently — nobody CAN observe an
 *     uncommitted write early because nobody else can acquire the lock to
 *     even look. It would NOT correctly model a real rollback that needs to
 *     undo a write made earlier in the same transaction; none of the flows
 *     under test do that (all validation happens before any mutation).
 *   - Only implements the specific queries these four modules issue. It is
 *     not a general SQL engine.
 */

'use strict';

class Mutex {
    constructor() {
        this._locked = false;
        this._waiters = [];
    }
    lock() {
        return new Promise((resolve) => {
            const grant = () => {
                this._locked = true;
                resolve(() => this._unlock());
            };
            if (!this._locked) grant();
            else this._waiters.push(grant);
        });
    }
    _unlock() {
        if (this._waiters.length > 0) this._waiters.shift()();
        else this._locked = false;
    }
}

function createFakePool(seed = {}) {
    const state = {
        nextId: { orders: 1, order_items: 1, order_status_history: 1, payments: 1, inventory_transactions: 1, coupon_usage: 1, cart: 1, cart_items: 1, refunds: 1, webhook_events: 1, rajasthan_districts: 1, delivery_zones: 1, serviceable_pincodes: 1, addresses: 1, invoices: 1 },
        products: new Map((seed.products || []).map((p) => [p.id, { ...p }])),
        addresses: new Map((seed.addresses || []).map((a) => [a.id, { ...a }])),
        carts: new Map((seed.carts || []).map((c) => [c.user_id, { ...c }])), // keyed by user_id
        cartItems: [...(seed.cartItems || [])], // { id, cart_id, product_id, quantity }
        priceTiers: [...(seed.priceTiers || [])],
        shippingSettings: seed.shippingSettings || { id: 1, shipping_charge: 0, free_shipping_threshold: 0 },
        coupons: new Map((seed.coupons || []).map((c) => [c.code, { ...c }])),
        couponUsage: [],
        orders: new Map(),
        orderItems: [],
        orderStatusHistory: [],
        payments: new Map(), // keyed by razorpay_order_id
        refunds: [],
        webhookEvents: new Map(), // keyed by event_id
        inventoryTransactions: [],
        invoices: [],
        businessSettings: { id: 1, invoice_counter: 0, invoice_counter_year: new Date().getFullYear() },
        // Phase 7 — Rajasthan District -> Delivery Zone -> Serviceable Pincode
        districts: new Map((seed.districts || []).map((d) => [d.id, { ...d }])),
        zones: new Map((seed.zones || []).map((z) => [z.id, { ...z }])),
        serviceablePincodes: new Map((seed.serviceablePincodes || []).map((p) => [p.pincode, { ...p }]))
    };

    const mutexes = new Map();
    const mutexFor = (key) => {
        if (!mutexes.has(key)) mutexes.set(key, new Mutex());
        return mutexes.get(key);
    };

    const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

    const nextAutoId = (table) => state.nextId[table]++;

    async function run(conn, sql, params = []) {
        const s = norm(sql);

        // ---- addresses -------------------------------------------------
        if (s.startsWith('SELECT * FROM addresses WHERE id = ? AND user_id = ?')) {
            const [id, userId] = params;
            const row = state.addresses.get(id);
            return [row && row.user_id === userId ? [row] : []];
        }
        // addressController.getAddresses
        if (s.startsWith('SELECT * FROM addresses WHERE user_id = ?')) {
            const [userId] = params;
            const rows = [...state.addresses.values()]
                .filter((a) => a.user_id === userId)
                .sort((a, b) => (b.is_default - a.is_default) || (b.id - a.id));
            return [rows];
        }
        // addressController.addAddress — "does this user already have any
        // saved addresses" check, used to auto-default the first one.
        if (s.startsWith('SELECT id FROM addresses WHERE user_id = ?')) {
            const [userId] = params;
            const rows = [...state.addresses.values()].filter((a) => a.user_id === userId).map((a) => ({ id: a.id }));
            return [rows];
        }
        if (s.startsWith('UPDATE addresses SET is_default = 0 WHERE user_id = ?')) {
            const [userId] = params;
            let affected = 0;
            for (const a of state.addresses.values()) {
                if (a.user_id === userId) { a.is_default = 0; affected += 1; }
            }
            return [{ affectedRows: affected }];
        }
        if (s.startsWith('INSERT INTO addresses (')) {
            const [
                user_id, full_name, business_name, phone, alternate_phone,
                house_building, street, area, city, district, state_, pincode,
                landmark, gstin, serviceable_pincode_id, address_type, is_default
            ] = params;
            const id = nextAutoId('addresses');
            state.addresses.set(id, {
                id, user_id, full_name, business_name, phone, alternate_phone,
                house_building, street, area, city, district, state: state_, pincode,
                landmark, gstin, serviceable_pincode_id, address_type, is_default: is_default ? 1 : 0,
                created_at: new Date()
            });
            return [{ insertId: id }];
        }
        if (s.startsWith('UPDATE addresses') && s.includes('SET full_name = ?')) {
            const [
                full_name, business_name, phone, alternate_phone, house_building,
                street, area, city, district, state_, pincode, landmark, gstin,
                serviceable_pincode_id, address_type, is_default, addressId, userId
            ] = params;
            const row = state.addresses.get(addressId);
            if (row && row.user_id === userId) {
                Object.assign(row, {
                    full_name, business_name, phone, alternate_phone, house_building,
                    street, area, city, district, state: state_, pincode, landmark, gstin,
                    serviceable_pincode_id, address_type, is_default: is_default ? 1 : 0
                });
            }
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (s.startsWith('DELETE FROM addresses WHERE id = ? AND user_id = ?')) {
            const [id, userId] = params;
            const row = state.addresses.get(id);
            const deleted = row && row.user_id === userId;
            if (deleted) state.addresses.delete(id);
            return [{ affectedRows: deleted ? 1 : 0 }];
        }
        if (s.startsWith('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?')) {
            const [id, userId] = params;
            const row = state.addresses.get(id);
            if (row && row.user_id === userId) row.is_default = 1;
            return [{ affectedRows: row ? 1 : 0 }];
        }

        // ---- cart / cart_items ------------------------------------------
        if (s.startsWith('SELECT id FROM cart WHERE user_id = ? FOR UPDATE')) {
            const [userId] = params;
            const release = await mutexFor(`cart:${userId}`).lock();
            conn._locks.push(release);
            const row = state.carts.get(userId);
            return [row ? [{ id: row.id }] : []];
        }
        if (s.includes('FROM cart_items ci') && s.includes('JOIN products p ON ci.product_id = p.id')) {
            const [cartId] = params;
            const rows = state.cartItems
                .filter((ci) => ci.cart_id === cartId)
                .map((ci) => {
                    const p = state.products.get(ci.product_id);
                    return {
                        quantity: ci.quantity,
                        product_id: p.id,
                        name: p.name,
                        sku: p.sku,
                        unit: p.unit,
                        price: p.price,
                        discount_price: p.discount_price
                    };
                })
                .sort((a, b) => a.product_id - b.product_id);
            return [rows];
        }
        if (s.startsWith('DELETE FROM cart_items WHERE cart_id = ?')) {
            const [cartId] = params;
            state.cartItems = state.cartItems.filter((ci) => ci.cart_id !== cartId);
            return [{ affectedRows: 1 }];
        }

        // ---- product_price_tiers -----------------------------------------
        if (s.startsWith('SELECT product_id, min_quantity, max_quantity, price FROM product_price_tiers')) {
            const [ids] = params;
            const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
            return [state.priceTiers.filter((t) => idSet.has(t.product_id))];
        }

        // ---- shipping_settings --------------------------------------------
        if (s.startsWith('SELECT * FROM shipping_settings WHERE id = 1')) {
            return [[state.shippingSettings]];
        }

        // ---- Phase 7: rajasthan_districts / delivery_zones / serviceable_pincodes ----
        // shippingService.validateDeliveryLocation's join query — the one
        // query every checkout and address save goes through.
        if (s.includes('FROM serviceable_pincodes sp') && s.includes('JOIN rajasthan_districts d') && s.includes('JOIN delivery_zones z') && s.includes('WHERE sp.pincode = ?')) {
            const [pincode] = params;
            const sp = state.serviceablePincodes.get(String(pincode).trim());
            if (!sp) return [[]];
            const d = state.districts.get(sp.district_id);
            const z = state.zones.get(sp.delivery_zone_id);
            if (!d || !z) return [[]];
            return [[{
                ...sp,
                district_name: d.name,
                zone_name: z.name,
                shipping_charge: z.shipping_charge,
                estimated_delivery_days_min: z.estimated_delivery_days_min,
                estimated_delivery_days_max: z.estimated_delivery_days_max,
                zone_active: z.is_active ? 1 : 0
            }]];
        }
        // zoneController.checkPincode's variant (columns aliased differently,
        // no WHERE change) — same underlying join, same fake tables.
        if (s.includes('FROM serviceable_pincodes sp') && s.includes('d.id AS district_id') && s.includes('WHERE sp.pincode = ?')) {
            const [pincode] = params;
            const sp = state.serviceablePincodes.get(String(pincode).trim());
            if (!sp) return [[]];
            const d = state.districts.get(sp.district_id);
            const z = state.zones.get(sp.delivery_zone_id);
            if (!d || !z) return [[]];
            return [[{
                id: sp.id, pincode: sp.pincode, city_town: sp.city_town, is_active: sp.is_active,
                delivery_charge_override: sp.delivery_charge_override, min_order_override: sp.min_order_override,
                district_id: d.id, district_name: d.name,
                zone_id: z.id, zone_name: z.name, shipping_charge: z.shipping_charge,
                estimated_delivery_days_min: z.estimated_delivery_days_min,
                estimated_delivery_days_max: z.estimated_delivery_days_max
            }]];
        }
        // admin: list/insert/update districts, zones, pincodes
        if (s.startsWith('SELECT id, name FROM rajasthan_districts WHERE is_active = 1') || s.startsWith('SELECT * FROM rajasthan_districts')) {
            const rows = [...state.districts.values()].filter((d) => s.includes('is_active = 1') ? d.is_active : true)
                .sort((a, b) => a.name.localeCompare(b.name));
            return [rows];
        }
        if (s.startsWith('INSERT INTO rajasthan_districts')) {
            const [name] = params;
            if ([...state.districts.values()].some((d) => d.name === name)) {
                const err = new Error('Duplicate district'); err.code = 'ER_DUP_ENTRY'; throw err;
            }
            const id = nextAutoId('rajasthan_districts');
            state.districts.set(id, { id, name, is_active: 1 });
            return [{ insertId: id }];
        }
        if (s.startsWith('UPDATE rajasthan_districts SET is_active = ? WHERE id = ?')) {
            const [isActive, id] = params;
            const d = state.districts.get(Number(id));
            if (d) d.is_active = isActive ? 1 : 0;
            return [{ affectedRows: d ? 1 : 0 }];
        }
        if (s.startsWith('SELECT * FROM delivery_zones WHERE is_active = 1') || s.startsWith('SELECT * FROM delivery_zones ORDER BY name')) {
            const rows = [...state.zones.values()].filter((z) => s.includes('is_active = 1') ? z.is_active : true)
                .sort((a, b) => a.name.localeCompare(b.name));
            return [rows];
        }
        if (s.startsWith('SELECT * FROM delivery_zones WHERE id = ?')) {
            const [id] = params;
            const z = state.zones.get(Number(id));
            return [z ? [z] : []];
        }
        if (s.startsWith('INSERT INTO delivery_zones')) {
            const [name, shipping_charge, days_min, days_max, is_active] = params;
            const id = nextAutoId('delivery_zones');
            state.zones.set(id, { id, name, shipping_charge, estimated_delivery_days_min: days_min, estimated_delivery_days_max: days_max, is_active: is_active ? 1 : 0 });
            return [{ insertId: id }];
        }
        if (s.startsWith('UPDATE delivery_zones SET name = ?')) {
            const [name, shipping_charge, days_min, days_max, is_active, id] = params;
            const z = state.zones.get(Number(id));
            if (z) Object.assign(z, { name, shipping_charge, estimated_delivery_days_min: days_min, estimated_delivery_days_max: days_max, is_active: is_active ? 1 : 0 });
            return [{ affectedRows: z ? 1 : 0 }];
        }
        if (s.startsWith('INSERT INTO serviceable_pincodes')) {
            const [pincode, city_town, district_id, delivery_zone_id, delivery_charge_override, min_order_override, is_active] = params;
            if (state.serviceablePincodes.has(pincode)) {
                const err = new Error('Duplicate pincode'); err.code = 'ER_DUP_ENTRY'; throw err;
            }
            const id = nextAutoId('serviceable_pincodes');
            state.serviceablePincodes.set(pincode, { id, pincode, city_town, district_id, delivery_zone_id, delivery_charge_override, min_order_override, is_active: is_active ? 1 : 0 });
            return [{ insertId: id }];
        }
        if (s.startsWith('UPDATE serviceable_pincodes SET city_town = ?')) {
            const [city_town, district_id, delivery_zone_id, delivery_charge_override, min_order_override, is_active, id] = params;
            const sp = [...state.serviceablePincodes.values()].find((p) => p.id === Number(id));
            if (sp) Object.assign(sp, { city_town, district_id, delivery_zone_id, delivery_charge_override, min_order_override, is_active: is_active ? 1 : 0 });
            return [{ affectedRows: sp ? 1 : 0 }];
        }
        if (s.startsWith('DELETE FROM serviceable_pincodes WHERE id = ?')) {
            const [id] = params;
            const sp = [...state.serviceablePincodes.values()].find((p) => p.id === Number(id));
            if (sp) state.serviceablePincodes.delete(sp.pincode);
            return [{ affectedRows: sp ? 1 : 0 }];
        }

        // ---- coupons --------------------------------------------------------
        if (s.startsWith('SELECT * FROM coupons WHERE code = ? AND is_active = 1')) {
            const [code] = params;
            const c = state.coupons.get(code);
            return [c && c.is_active ? [c] : []];
        }
        if (s.startsWith('SELECT id FROM coupons WHERE code = ?')) {
            const [code] = params;
            const c = state.coupons.get(code);
            return [c ? [{ id: c.id }] : []];
        }
        if (s.startsWith('INSERT INTO coupon_usage')) {
            const [couponId, userId, orderId] = params;
            const id = nextAutoId('coupon_usage');
            state.couponUsage.push({ id, coupon_id: couponId, user_id: userId, order_id: orderId });
            return [{ insertId: id }];
        }

        // ---- products: lock + read (lockProductsForUpdate / inventoryController) --
        if (s.includes('FROM products WHERE id IN (?) ORDER BY id ASC FOR UPDATE')) {
            const [ids] = params;
            const sortedIds = [...new Set(Array.isArray(ids) ? ids : [ids])].sort((a, b) => a - b);
            for (const id of sortedIds) {
                const release = await mutexFor(`products:${id}`).lock();
                conn._locks.push(release);
            }
            const rows = sortedIds.map((id) => state.products.get(id)).filter(Boolean);
            return [rows]; // live references — safe: caller holds the only lock on each row
        }

        // ---- products: mutations (inventoryService) ------------------------
        if (s.startsWith('UPDATE products SET reserved_stock = ? WHERE id = ?')) {
            const [next, id] = params;
            state.products.get(id).reserved_stock = next;
            return [{ affectedRows: 1 }];
        }
        if (s.startsWith('UPDATE products SET stock_quantity = ?, reserved_stock = ? WHERE id = ?')) {
            const [stock, reserved, id] = params;
            const p = state.products.get(id);
            p.stock_quantity = stock;
            p.reserved_stock = reserved;
            return [{ affectedRows: 1 }];
        }
        if (s.startsWith('UPDATE products SET stock_quantity = ? WHERE id = ?')) {
            const [next, id] = params;
            state.products.get(id).stock_quantity = next;
            return [{ affectedRows: 1 }];
        }

        // ---- inventory_transactions ----------------------------------------
        if (s.startsWith('INSERT INTO inventory_transactions')) {
            const [productId, transactionType, quantity, referenceType, referenceId, previousQuantity, newQuantity, createdBy, notes] = params;
            const id = nextAutoId('inventory_transactions');
            state.inventoryTransactions.push({
                id, product_id: productId, transaction_type: transactionType, quantity,
                reference_type: referenceType, reference_id: referenceId,
                previous_quantity: previousQuantity, new_quantity: newQuantity,
                created_by: createdBy, notes, created_at: new Date()
            });
            return [{ insertId: id }];
        }

        // ---- orders: insert / temp-number rename ----------------------------
        if (s.startsWith('INSERT INTO orders (')) {
            const [
                order_number, user_id, address_id, shipping_full_name, shipping_phone,
                shipping_address_text, subtotal, discount_amount, coupon_code,
                shipping_charge, total_amount, payment_method, payment_status, order_status, notes,
                reservation_expires_at
            ] = params;
            const id = nextAutoId('orders');
            state.orders.set(id, {
                id, order_number, user_id, address_id, shipping_full_name, shipping_phone,
                shipping_address_text, subtotal, discount_amount, coupon_code,
                shipping_charge, total_amount, payment_method, payment_status, order_status, notes,
                reservation_expires_at, created_at: new Date()
            });
            return [{ insertId: id }];
        }
        if (s.startsWith('UPDATE orders SET order_number = ? WHERE id = ?')) {
            const [orderNumber, id] = params;
            state.orders.get(id).order_number = orderNumber;
            return [{ affectedRows: 1 }];
        }

        // ---- expired-reservation sweep (inventoryService.releaseExpiredReservations) --
        if (s.startsWith("SELECT o.id FROM orders o WHERE o.payment_method = 'online'")) {
            // params: [productIds?] only present when the EXISTS(...) product filter is in the SQL
            const hasProductFilter = s.includes('EXISTS (SELECT 1 FROM order_items oi');
            const productIds = hasProductFilter ? new Set(params[0]) : null;
            const now = Date.now();
            const matches = [...state.orders.values()].filter((o) => {
                if (o.payment_method !== 'online') return false;
                if (o.order_status !== 'Pending') return false;
                if (o.payment_status !== 'pending') return false;
                if (!o.reservation_expires_at) return false;
                if (new Date(o.reservation_expires_at).getTime() >= now) return false;
                if (productIds) {
                    const ownItems = state.orderItems.filter((oi) => oi.order_id === o.id);
                    if (!ownItems.some((oi) => productIds.has(oi.product_id))) return false;
                }
                return true;
            }).sort((a, b) => a.id - b.id);
            for (const o of matches) {
                const release = await mutexFor(`orders:${o.id}`).lock();
                conn._locks.push(release);
            }
            return [matches.map((o) => ({ id: o.id }))];
        }

        // ---- orders: lock + read --------------------------------------------
        if (s.startsWith('SELECT * FROM orders WHERE id = ? FOR UPDATE')) {
            const [id] = params;
            const release = await mutexFor(`orders:${id}`).lock();
            conn._locks.push(release);
            const row = state.orders.get(Number(id));
            return [row ? [row] : []];
        }
        // updateOrderStatus: JOIN query with users (FOR UPDATE)
        if (s.includes('FROM orders o') && s.includes('JOIN users u ON o.user_id = u.id') && s.includes('WHERE o.id = ? FOR UPDATE')) {
            const [id] = params;
            const release = await mutexFor(`orders:${id}`).lock();
            conn._locks.push(release);
            const row = state.orders.get(Number(id));
            return [row ? [{ ...row, full_name: 'Test User', email: 'test@test.com' }] : []];
        }
        // getOrderDetail: JOIN query without FOR UPDATE (user_name, user_email, user_phone)
        if (s.includes('FROM orders o') && s.includes('JOIN users u ON o.user_id = u.id') && !s.includes('FOR UPDATE')) {
            const [id] = params;
            const row = state.orders.get(Number(id));
            return [row ? [{ ...row, user_name: 'Test User', user_email: 'test@test.com', user_phone: '9999999999' }] : []];
        }
        if (s.startsWith('SELECT * FROM orders WHERE id = ? AND user_id = ?')) {
            const [id, userId] = params;
            const row = state.orders.get(Number(id));
            return [row && row.user_id === userId ? [row] : []];
        }

        // ---- orders: status/payment mutations --------------------------------
        if (s.startsWith("UPDATE orders SET payment_status = 'failed', order_status = 'Cancelled' WHERE id = ?")) {
            const [id] = params;
            const o = state.orders.get(Number(id));
            o.payment_status = 'failed'; o.order_status = 'Cancelled';
            return [{ affectedRows: 1 }];
        }
        if (/UPDATE orders SET payment_status = ['"]?paid['"]?, order_status = ['"]?Confirmed['"]?, reservation_expires_at = NULL WHERE id = \?/.test(s)) {
            const [id] = params;
            const o = state.orders.get(Number(id));
            if (o) { o.payment_status = 'paid'; o.order_status = 'Confirmed'; o.reservation_expires_at = null; }
            return [{ affectedRows: o ? 1 : 0 }];
        }
        // cancelOrder with CASE WHEN (keeps payment_status='paid' for paid orders)
        if (/UPDATE orders SET order_status = 'Cancelled', payment_status = CASE WHEN payment_status = 'paid' THEN 'paid' ELSE 'failed' END WHERE id = \?/.test(s)) {
            const [id] = params;
            const o = state.orders.get(Number(id));
            if (o) {
                o.payment_status = o.payment_status === 'paid' ? 'paid' : 'failed';
                o.order_status = 'Cancelled';
            }
            return [{ affectedRows: o ? 1 : 0 }];
        }
        // updateOrderStatus: multi-column update with COALESCE
        if (/UPDATE orders\s+SET order_status = \?,\s+payment_status = COALESCE\(\?, payment_status\),/.test(s)) {
            const [orderStatus, paymentStatus, courierProvider, trackingNumber, estDelivery, id] = params;
            const o = state.orders.get(Number(id));
            if (o) {
                o.order_status = orderStatus;
                if (paymentStatus) o.payment_status = paymentStatus;
                if (courierProvider) o.courier_provider = courierProvider;
                if (trackingNumber) o.tracking_number = trackingNumber;
                if (estDelivery) o.estimated_delivery_date = estDelivery;
            }
            return [{ affectedRows: o ? 1 : 0 }];
        }
        // markPaymentFailed / releaseExpiredReservations (payment_status='failed', order_status='Cancelled' — any column order)
        if (/UPDATE orders SET .+ WHERE id = \?/.test(s) && s.includes("'Cancelled'") && s.includes("'failed'") && !s.includes('CASE WHEN')) {
            const [id] = params;
            const o = state.orders.get(Number(id));
            if (o) { o.payment_status = 'failed'; o.order_status = 'Cancelled'; }
            return [{ affectedRows: o ? 1 : 0 }];
        }
        // requestReturn: simple single-column status update (status is a literal, not a param)
        if (/UPDATE orders SET order_status = '.+' WHERE id = \?/.test(s) && !s.includes('CASE WHEN') && !s.includes('COALESCE')) {
            const match = s.match(/UPDATE orders SET order_status = '([^']+)'/);
            const [id] = params;
            const o = state.orders.get(Number(id));
            if (o && match) { o.order_status = match[1]; }
            return [{ affectedRows: o ? 1 : 0 }];
        }

        // ---- order_items ------------------------------------------------------
        if (s.startsWith('INSERT INTO order_items')) {
            const [order_id, product_id, product_name, sku, unit, price, quantity, total_price] = params;
            const id = nextAutoId('order_items');
            state.orderItems.push({ id, order_id, product_id, product_name, sku, unit, price, quantity, total_price, cancelled_quantity: 0, returned_quantity: 0 });
            return [{ insertId: id }];
        }
        if (s.startsWith('SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id ASC')) {
            const [orderId] = params;
            return [state.orderItems.filter((oi) => oi.order_id === Number(orderId)).sort((a, b) => a.product_id - b.product_id)];
        }
        // getOrderDetail: order items joined with product thumbnail/slug for display
        if (s.includes('FROM order_items oi') && s.includes('LEFT JOIN products p') && s.includes('p.thumbnail') && s.includes('p.slug')) {
            const [orderId] = params;
            return [state.orderItems
                .filter((oi) => oi.order_id === Number(orderId))
                .sort((a, b) => a.id - b.id)
                .map((oi) => {
                    const product = state.products.get(oi.product_id);
                    return { ...oi, thumbnail: product ? product.thumbnail || null : null, slug: product ? product.slug || null : null };
                })];
        }
        // applyPartialCancellation: select with cancelled_quantity/returned_quantity
        if (s.includes('FROM order_items') && s.includes('cancelled_quantity') && s.includes('ORDER BY id ASC')) {
            const [orderId] = params;
            return [state.orderItems.filter((oi) => oi.order_id === Number(orderId)).sort((a, b) => a.id - b.id)];
        }
        // applyPartialCancellation: update cancelled_quantity
        if (s.startsWith('UPDATE order_items SET cancelled_quantity = cancelled_quantity + ? WHERE id = ?')) {
            const [qty, id] = params;
            const item = state.orderItems.find((i) => i.id === Number(id));
            if (item) item.cancelled_quantity += qty;
            return [{ affectedRows: item ? 1 : 0 }];
        }
        // applyPartialCancellation: fresh items check
        if (s.includes('FROM order_items') && s.includes('quantity, cancelled_quantity, returned_quantity') && s.includes('WHERE order_id = ?') && !s.includes('ORDER BY')) {
            const [orderId] = params;
            return [state.orderItems.filter((oi) => oi.order_id === Number(orderId))];
        }

        // ---- order_status_history (4 or 5-col insert, with old_status) ----------
        if (s.startsWith('INSERT INTO order_status_history')) {
            const id = nextAutoId('order_status_history');
            if (params.length >= 5) {
                const [order_id, old_status, status, comment, created_by] = params;
                state.orderStatusHistory.push({ id, order_id, old_status, status, comment, created_by, created_at: new Date() });
            } else {
                const [order_id, status, comment, created_by] = params;
                state.orderStatusHistory.push({ id, order_id, old_status: null, status, comment, created_by, created_at: new Date() });
            }
            return [{ insertId: id }];
        }
        // order_status_history: SELECT for return window check (Delivered)
        if (s.includes('FROM order_status_history') && s.includes("status = 'Delivered'") && s.includes('ORDER BY created_at DESC LIMIT 1')) {
            const [orderId] = params;
            const entries = state.orderStatusHistory
                .filter((h) => h.order_id === Number(orderId) && h.status === 'Delivered')
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            return [entries.length > 0 ? [{ created_at: entries[0].created_at }] : []];
        }
        // getOrderDetail: full history for an order, oldest first
        if (s.startsWith('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC')) {
            const [orderId] = params;
            return [state.orderStatusHistory
                .filter((h) => h.order_id === Number(orderId))
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))];
        }

        // ---- payments -----------------------------------------------------------
        if (s.startsWith('INSERT INTO payments')) {
            const [order_id, razorpay_order_id, amount] = params;
            const id = nextAutoId('payments');
            state.payments.set(razorpay_order_id, { id, order_id, razorpay_order_id, amount, amount_refunded: 0, status: 'created' });
            return [{ insertId: id }];
        }
        // paymentFulfillmentService: markPaymentFailed
        if (/UPDATE payments SET status = ['"]?failed['"]?, error_code = \?, error_description = \? WHERE razorpay_order_id = \?/.test(s)) {
            const [errorCode, errorDesc, rid] = params;
            const p = state.payments.get(rid);
            if (p) { p.status = 'failed'; p.error_code = errorCode; p.error_description = errorDesc; }
            return [{ affectedRows: p ? 1 : 0 }];
        }
        // paymentController legacy path (double quotes)
        if (/UPDATE payments SET status = ["']failed["'] WHERE razorpay_order_id = \?/.test(s)) {
            const [rid] = params;
            const p = state.payments.get(rid);
            if (p) p.status = 'failed';
            return [{ affectedRows: p ? 1 : 0 }];
        }
        // paymentFulfillmentService: fulfillCapturedPayment
        if (/UPDATE payments SET razorpay_payment_id = \?, razorpay_signature = COALESCE\(\?, razorpay_signature\), payment_method = COALESCE\(\?, payment_method\), status = ['"]?captured['"]?, captured_at = NOW\(\) WHERE razorpay_order_id = \?/.test(s)) {
            const [paymentId, signature, method, rid] = params;
            const p = state.payments.get(rid);
            if (p) {
                p.razorpay_payment_id = paymentId;
                if (signature) p.razorpay_signature = signature;
                if (method) p.payment_method = method;
                p.status = 'captured';
                p.captured_at = new Date();
            }
            return [{ affectedRows: p ? 1 : 0 }];
        }
        // paymentController legacy verify path (double quotes)
        if (/UPDATE payments SET razorpay_payment_id = \?, razorpay_signature = \?, status = ["']captured["'] WHERE razorpay_order_id = \?/.test(s)) {
            const [paymentId, signature, rid] = params;
            const p = state.payments.get(rid);
            if (p) { p.razorpay_payment_id = paymentId; p.razorpay_signature = signature; p.status = 'captured'; }
            return [{ affectedRows: p ? 1 : 0 }];
        }
        // refundService: submitRefundToRazorpay — update refund row with razorpay_refund_id
        if (s.startsWith('UPDATE refunds SET razorpay_refund_id = ?, status = ')) {
            const [refundId, refundRowId] = params;
            const r = state.refunds.find((r) => r.id === refundRowId);
            if (r) { r.razorpay_refund_id = refundId; r.status = 'processing'; }
            return [{ affectedRows: r ? 1 : 0 }];
        }
        // refundService: submitRefundToRazorpay — mark failed
        if (/UPDATE refunds SET status = 'failed', notes = CONCAT/.test(s)) {
            const [appendNote, refundRowId] = params;
            const r = state.refunds.find((r) => r.id === refundRowId);
            if (r) { r.status = 'failed'; r.notes = (r.notes || '') + appendNote; }
            return [{ affectedRows: r ? 1 : 0 }];
        }
        // refundService: finalizeRefund — mark processed
        if (/UPDATE refunds SET status = 'processed' WHERE id = \?/.test(s)) {
            const [id] = params;
            const r = state.refunds.find((r) => r.id === id);
            if (r) r.status = 'processed';
            return [{ affectedRows: r ? 1 : 0 }];
        }
        // refundService: finalizeRefund — update payment amount_refunded + status
        if (/UPDATE payments SET amount_refunded = \?, status = \? WHERE id = \?/.test(s)) {
            const [amountRefunded, status, paymentId] = params;
            for (const p of state.payments.values()) {
                if (p.id === paymentId) {
                    p.amount_refunded = amountRefunded;
                    p.status = status;
                    break;
                }
            }
            return [{ affectedRows: 1 }];
        }
        // refundService: finalizeRefund — update order payment_status + order_status
        if (/UPDATE orders SET payment_status = \?, order_status = \? WHERE id = \?/.test(s)) {
            const [paymentStatus, orderStatus, id] = params;
            const o = state.orders.get(Number(id));
            if (o) { o.payment_status = paymentStatus; o.order_status = orderStatus; }
            return [{ affectedRows: o ? 1 : 0 }];
        }
        // refundService: markRefundFailed — select by razorpay_refund_id FOR UPDATE
        if (/SELECT \* FROM refunds WHERE razorpay_refund_id = \? FOR UPDATE/.test(s)) {
            const [refundId] = params;
            const r = state.refunds.find((r) => r.razorpay_refund_id === refundId);
            return [r ? [r] : []];
        }
        // refundService: finalizeRefund — select by payment_id + pending status FOR UPDATE
        if (/SELECT \* FROM refunds WHERE payment_id = \? AND razorpay_refund_id IS NULL/.test(s)) {
            const [paymentId] = params;
            const r = state.refunds.find((r) => r.payment_id === paymentId && !r.razorpay_refund_id && ['created', 'processing'].includes(r.status));
            return [r ? [r] : []];
        }
        // refundService: findOrCreateRefundRow — link pending refund to razorpay refund id
        if (s.startsWith('UPDATE refunds SET razorpay_refund_id = ? WHERE id = ?')) {
            const [refundId, rowId] = params;
            const r = state.refunds.find((r) => r.id === rowId);
            if (r) r.razorpay_refund_id = refundId;
            return [{ affectedRows: r ? 1 : 0 }];
        }
        // refundService: findOrCreateRefundRow — insert on-the-fly refund (dashboard-initiated)
        // The SQL hardcodes restock=0, status='processing', notes, initiated_by='Razorpay Dashboard'
        // and only passes 4 params: [order_id, payment_id, razorpay_refund_id, amount]
        if (/INSERT INTO refunds \(order_id, payment_id, razorpay_refund_id, amount, restock, status, notes, initiated_by\)/.test(s)) {
            const [orderId, paymentId, razorpayRefundId, amount] = params;
            const id = nextAutoId('refunds');
            const row = { id, order_id: orderId, payment_id: paymentId, razorpay_refund_id: razorpayRefundId, idempotency_key: null, amount, restock: 0, status: 'processing', notes: 'Reconciled from webhook — not initiated via this app.', initiated_by: 'Razorpay Dashboard', created_at: new Date(), updated_at: new Date() };
            state.refunds.push(row);
            return [{ insertId: id }];
        }
        // refundController: initiateRefund — create pending refund record
        if (/INSERT INTO refunds \(order_id, payment_id, amount, restock, status, notes, initiated_by, idempotency_key\)/.test(s)) {
            const [orderId, paymentId, amount, restock, status, notes, initiatedBy, idempotencyKey] = params;
            const id = nextAutoId('refunds');
            const row = { id, order_id: orderId, payment_id: paymentId, razorpay_refund_id: null, idempotency_key: idempotencyKey, amount, restock, status, notes, initiated_by: initiatedBy, created_at: new Date(), updated_at: new Date() };
            state.refunds.push(row);
            return [{ insertId: id }];
        }
        // refundController: getOrderRefunds
        if (/SELECT \* FROM refunds WHERE order_id = \? ORDER BY created_at DESC/.test(s)) {
            const [orderId] = params;
            const rows = state.refunds.filter((r) => r.order_id === Number(orderId)).sort((a, b) => b.created_at - a.created_at);
            return [rows];
        }
        // refundController: check idempotency_key
        if (/SELECT \* FROM refunds WHERE idempotency_key = \?/.test(s)) {
            const [key] = params;
            const rows = state.refunds.filter((r) => r.idempotency_key === key);
            return [rows];
        }
        // refundController: find latest captured payment for refund
        if (/SELECT \* FROM payments WHERE order_id = \? AND status IN \('captured', 'partially_refunded', 'refunded'\)/.test(s)) {
            const [orderId] = params;
            const rows = [...state.payments.values()].filter((p) => p.order_id === Number(orderId) && ['captured', 'partially_refunded', 'refunded'].includes(p.status));
            rows.sort((a, b) => b.id - a.id);
            return [rows.length > 0 ? [rows[0]] : []];
        }
        // paymentController: find captured payment for auto-refund on cancel
        if (/SELECT \* FROM payments WHERE order_id = \? AND status = 'captured' ORDER BY id DESC LIMIT 1/.test(s)) {
            const [orderId] = params;
            const rows = [...state.payments.values()].filter((p) => p.order_id === Number(orderId) && p.status === 'captured');
            rows.sort((a, b) => b.id - a.id);
            return [rows.length > 0 ? [rows[0]] : []];
        }
        // triggerAutoRefund: find captured/partially_refunded payment
        if (/SELECT \* FROM payments WHERE order_id = \? AND status IN \('captured', 'partially_refunded'\)/.test(s)) {
            const [orderId] = params;
            const rows = [...state.payments.values()].filter((p) => p.order_id === Number(orderId) && ['captured', 'partially_refunded'].includes(p.status));
            rows.sort((a, b) => b.id - a.id);
            return [rows.length > 0 ? [rows[0]] : []];
        }
        // webhookController: loadOrderAndPaymentForPayment — select payment by razorpay_order_id
        if (/SELECT \* FROM payments WHERE razorpay_order_id = \?/.test(s) && !s.includes('FOR UPDATE')) {
            const [rid] = params;
            const p = state.payments.get(rid);
            return [p ? [p] : []];
        }
        // webhookController: loadOrderAndPaymentForRefund — select payment by razorpay_payment_id
        if (/SELECT \* FROM payments WHERE razorpay_payment_id = \?/.test(s)) {
            const [payId] = params;
            let found = null;
            for (const p of state.payments.values()) {
                if (p.razorpay_payment_id === payId) { found = p; break; }
            }
            return [found ? [found] : []];
        }
        // webhookController: user lookup for email dispatch
        if (/SELECT full_name, email, phone FROM users WHERE id = \?/.test(s)) {
            return [[{ full_name: 'Test User', email: 'test@test.com', phone: '9999999999' }]];
        }
        // webhookController: webhook_events insert
        if (s.startsWith('INSERT INTO webhook_events')) {
            const [eventId, eventType, entityId, payload] = params;
            if (state.webhookEvents.has(eventId)) {
                const err = new Error('Duplicate entry');
                err.code = 'ER_DUP_ENTRY';
                throw err;
            }
            state.webhookEvents.set(eventId, { id: nextAutoId('webhook_events'), event_id: eventId, event_type: eventType, entity_id: entityId, payload, processed_at: null, created_at: new Date() });
            return [{ insertId: state.webhookEvents.get(eventId).id }];
        }
        // webhookController: mark event processed
        if (s.startsWith('UPDATE webhook_events SET processed_at = NOW() WHERE event_id = ?')) {
            const [eventId] = params;
            const ev = state.webhookEvents.get(eventId);
            if (ev) ev.processed_at = new Date();
            return [{ affectedRows: ev ? 1 : 0 }];
        }

                // ---- business_settings ----
        if (s.startsWith('SELECT * FROM business_settings WHERE id = 1') || s.startsWith('SELECT invoice_counter, invoice_counter_year FROM business_settings')) {
            return [[{ ...state.businessSettings, business_name: 'Mandi Connect', business_address: 'Jaipur, Rajasthan', business_gstin: '08AAAAA0000A1Z5', business_state: 'Rajasthan' }]];
        }
        if (s.startsWith('SELECT tax_type, rate_percent, description, is_enabled FROM tax_config')) {
            return [[{ tax_type: 'cgst', rate_percent: 2.5, description: 'CGST 2.5%', is_enabled: 1 }, { tax_type: 'sgst', rate_percent: 2.5, description: 'SGST 2.5%', is_enabled: 1 }]];
        }
        if (s.startsWith('INSERT INTO business_settings')) {
            return [{ affectedRows: 1 }];
        }
        if (s.startsWith('UPDATE business_settings SET invoice_counter = 0')) {
            const [yr] = params;
            state.businessSettings.invoice_counter = 0;
            state.businessSettings.invoice_counter_year = yr;
            return [{ affectedRows: 1 }];
        }
        if (s.startsWith('UPDATE business_settings SET invoice_counter = ?')) {
            const [counter] = params;
            state.businessSettings.invoice_counter = counter;
            return [{ affectedRows: 1 }];
        }

        // ---- invoices ----
        if (s.includes('FROM invoices WHERE order_id = ?')) {
            const [orderId] = params;
            const matches = state.invoices.filter((inv) => inv.order_id === Number(orderId));
            matches.sort((a, b) => a.id - b.id);
            return [matches];
        }
        if (s.startsWith('SELECT * FROM invoices WHERE id = ?')) {
            const [id] = params;
            const inv = state.invoices.find((i) => i.id === Number(id));
            return [inv ? [inv] : []];
        }
        if (s.startsWith('INSERT INTO invoices')) {
            const id = nextAutoId('invoices');
            const [
                invoice_number, order_id, business_name, business_address, business_gstin, business_state,
                customer_name, customer_email, customer_phone, customer_gstin, billing_address, shipping_address,
                subtotal, discount_amount, shipping_charge, taxable_amount, cgst_amount, sgst_amount, igst_amount,
                tax_amount, tax_rate_label, total_amount, payment_status, payment_method, line_items, notes
            ] = params;
            const inv = {
                id, invoice_number, order_id, business_name, business_address, business_gstin, business_state,
                customer_name, customer_email, customer_phone, customer_gstin, billing_address, shipping_address,
                subtotal, discount_amount, shipping_charge, taxable_amount, cgst_amount, sgst_amount, igst_amount,
                tax_amount, tax_rate_label, total_amount, payment_status, payment_method, line_items, notes, created_at: new Date()
            };
            state.invoices.push(inv);
            return [{ insertId: id }];
        }
        if (s.startsWith('UPDATE invoices SET payment_status =')) {
            const [pm, orderId] = params.length === 2 ? params : [null, params[0]];
            const inv = state.invoices.find((i) => i.order_id === Number(orderId));
            if (inv) {
                inv.payment_status = 'paid';
                if (pm) inv.payment_method = pm;
            }
            return [{ affectedRows: inv ? 1 : 0 }];
        }

        throw new Error(`testDb fake pool: unhandled query -> ${s}`);
    }

    function makeConnection() {
        const conn = {
            _locks: [],
            query: (sql, params) => run(conn, sql, params),
            beginTransaction: async () => { conn._locks = []; },
            commit: async () => { conn._locks.forEach((release) => release()); conn._locks = []; },
            rollback: async () => { conn._locks.forEach((release) => release()); conn._locks = []; },
            release: () => {}
        };
        return conn;
    }

    return {
        state,
        getConnection: async () => makeConnection(),
        query: async (sql, params) => run(makeConnection(), sql, params)
    };
}

module.exports = { createFakePool };