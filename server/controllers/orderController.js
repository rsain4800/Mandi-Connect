const crypto = require('crypto');
const { pool } = require('../config/db');
const { sendAdminNewOrderEmail, sendCustomerOrderEmail, sendCustomerStatusEmail } = require('../utils/emailService');
const logger = require('../utils/logger');
const { validateOrderQuantity, resolveEffectivePrice } = require('../utils/wholesale');
const inventoryService = require('../services/inventoryService');
const refundService = require('../services/refundService');
const orderStateMachine = require('../services/orderStateMachine');
const shippingService = require('../services/shippingService');
const { RESERVATION_TTL_MINUTES } = inventoryService;
const invoiceService = require('../services/invoiceService');

// Builds the final, collision-safe order number (e.g. MC-2026-000123) from the
// row's own auto-increment id, which MySQL guarantees is unique — unlike a
// `SELECT COUNT(*) + 1` snapshot, which two simultaneous checkouts can both read
// before either has inserted, producing duplicate order numbers.
const buildOrderNumber = (insertId) => {
    const year = new Date().getFullYear();
    return `MC-${year}-${String(insertId).padStart(6, '0')}`;
};

// Temporary unique placeholder used to satisfy the NOT NULL UNIQUE order_number
// column between INSERT and the follow-up UPDATE that sets the real, id-based number.
const buildTempOrderNumber = () => `TMP-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

// Every order_status_history row this controller ever writes goes through
// here (Phase 6) so `old_status` is never forgotten at one call site while
// present at another — see migrations/024_orderLifecycleHardening.js for
// why the column exists (the spec's audit shape is
// order_id/old_status/new_status/changed_by/reason/created_at).
const insertHistory = async (connection, { orderId, oldStatus, newStatus, comment, createdBy }) => {
    await connection.query(
        'INSERT INTO order_status_history (order_id, old_status, status, comment, created_by) VALUES (?, ?, ?, ?, ?)',
        [orderId, oldStatus || null, newStatus, comment, createdBy]
    );
};

// Kicks off a REAL Razorpay refund for a paid order — shared by cancelOrder
// (full and partial cancellation) and updateOrderStatus's return-approval
// path, so there is exactly one place that decides "an order-level action
// just made part or all of a captured payment refundable, go request it
// from Razorpay" rather than three slightly different copies of the same
// wasPaid-branch logic. Fire-and-forget by design (called after the
// triggering transaction has committed) — same rationale as the original
// cancelOrder comment this was extracted from: never hold a DB row lock
// across the Razorpay HTTP call, and a failure here is logged for manual
// follow-up rather than surfaced as a failure of the action that triggered
// it (the cancellation/return itself already succeeded and committed).
const triggerAutoRefund = ({ order, amount, reason, initiatedBy, restock = false }) => {
    (async () => {
        const [payments] = await pool.query(
            `SELECT * FROM payments WHERE order_id = ? AND status IN ('captured', 'partially_refunded') ORDER BY id DESC LIMIT 1`,
            [order.id]
        );
        if (payments.length === 0 || !payments[0].razorpay_payment_id) {
            logger.error({ orderId: order.id }, 'Order was paid but has no captured payment row — cannot auto-refund, needs manual review.');
            return;
        }
        const payment = payments[0];
        const remaining = parseFloat(payment.amount) - parseFloat(payment.amount_refunded || 0);
        const refundAmount = amount != null ? Math.min(amount, remaining) : remaining;
        if (!(refundAmount > 0)) return; // nothing left to refund (e.g. already fully refunded)

        await refundService.initiateRefund(pool, {
            order,
            payment,
            amount: refundAmount,
            reason,
            restock,
            idempotencyKey: null,
            initiatedBy
        });
    })().catch((err) => {
        logger.error({ err, orderId: order.id }, 'Automatic refund failed to initiate — needs manual admin refund');
    });
};

// Create Order (COD or Initiated for Online)
const createOrder = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const userId = req.user.id;
        const { address_id, payment_method = 'cod', coupon_code = null, notes = null } = req.body;

        if (!address_id) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Please select a delivery address.' });
        }

        // Fetch Address
        const [addresses] = await connection.query('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [address_id, userId]);
        if (addresses.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }
        const addr = addresses[0];
        const shippingAddressText = `${addr.house_building}, ${addr.street}, ${addr.area}, ${addr.city}, ${addr.state} - ${addr.pincode} (Landmark: ${addr.landmark || 'N/A'})`;

        // Phase 7 — checkout-time serviceability re-check.
        // addressController already validates Rajasthan/pincode at the
        // moment an address is SAVED, but that's not enough on its own:
        // an admin can deactivate a pincode or its whole delivery zone at
        // any time afterward (services/shippingService.js), and a saved
        // address's own `district`/`serviceable_pincode_id` columns are
        // a snapshot from save-time, not a live status. Without this,
        // checkout would silently trust a since-invalidated address —
        // exactly the "changed serviceability after address selection" /
        // "checkout bypass" gap the Phase 7 spec calls out. So: re-derive
        // serviceability fresh, right now, from the address's own
        // state+pincode text, inside this same transaction/connection —
        // never from the stored serviceable_pincode_id, which could also
        // be stale or NULL (see migrations/addresses.js's ON DELETE SET NULL).
        const deliveryLocation = await shippingService.validateDeliveryLocation(addr.state, addr.pincode, connection);
        if (!deliveryLocation.valid) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: `This delivery address is no longer serviceable: ${deliveryLocation.message}`,
                code: deliveryLocation.code
            });
        }

        // Fetch Cart Items. Locks the cart row itself (FOR UPDATE) — this is
        // what makes a duplicate/double-submitted checkout request from the
        // same user safe without any client-side idempotency key: if this
        // same user's browser (double click, retried request, two tabs)
        // fires createOrder twice at once, the second call blocks here until
        // the first one commits. InnoDB locking reads always see the latest
        // committed data once the lock is granted, so the second call then
        // re-reads cart_items (now empty, since the first call clears them
        // on commit — see "Clear Cart" below) and correctly falls through to
        // the "cart is empty" response instead of creating a second order
        // for the same items.
        const [carts] = await connection.query('SELECT id FROM cart WHERE user_id = ? FOR UPDATE', [userId]);
        if (carts.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Cart is empty.' });
        }
        const cartId = carts[0].id;

        const [cartItems] = await connection.query(
            `SELECT ci.quantity, p.id AS product_id, p.name, p.sku, p.unit, p.price, p.discount_price
             FROM cart_items ci
             JOIN products p ON ci.product_id = p.id
             WHERE ci.cart_id = ?
             ORDER BY p.id ASC`,
            [cartId]
        );

        if (cartItems.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Your cart is empty.' });
        }

        const productIds = cartItems.map((item) => item.product_id);

        // Reclaim any expired reservations on THESE specific products before
        // locking/checking availability — so a customer whose cart overlaps
        // with someone else's abandoned, unpaid online order doesn't have to
        // wait for the background sweep (server.js) to free that stock back
        // up. Scoped to productIds (not a full sweep) so this never blocks
        // on, or is slowed by, expired reservations on unrelated products.
        // Runs in its own transaction on `pool` — our own `connection`
        // transaction hasn't locked anything yet at this point, so there's
        // no lock contention between the two.
        await inventoryService.releaseExpiredReservations(pool, { productIds });

        // Lock the rows for every product in the cart (in a stable, ascending
        // id order to avoid deadlocking against other concurrent checkouts)
        // before checking availability, so two simultaneous orders can never
        // both pass the stock check for the last unit of the same product.
        // This is also the authoritative re-check of MOQ/max/active status —
        // a product could have been edited or deactivated after it was added
        // to the cart, so the cart's own contents are never trusted blindly.
        //
        // Locking the cart row itself (not just the products) is what makes
        // a duplicate/double-submitted checkout request from the same user
        // safe: two simultaneous createOrder calls for the same user both
        // try to lock `cart` via getUserCartId's caller below — see the
        // `SELECT ... FOR UPDATE` on `cart` a few lines up in this function.
        // The second call only proceeds once the first has committed (and
        // cleared cart_items), at which point it correctly sees an empty
        // cart and returns "cart is empty" instead of creating a second order.
        const lockedProductById = await inventoryService.lockProductsForUpdate(connection, productIds);

        // Wholesale price tiers for every product in the cart, grouped by
        // product_id, so tiered pricing can be resolved per line item.
        const [tierRows] = await connection.query(
            'SELECT product_id, min_quantity, max_quantity, price FROM product_price_tiers WHERE product_id IN (?)',
            [productIds]
        );
        const tiersByProductId = new Map();
        for (const tier of tierRows) {
            if (!tiersByProductId.has(tier.product_id)) tiersByProductId.set(tier.product_id, []);
            tiersByProductId.get(tier.product_id).push(tier);
        }

        // Verify MOQ/max/stock and calculate subtotal using wholesale pricing
        let subtotal = 0;
        const orderItemsToInsert = [];

        for (const item of cartItems) {
            const lockedProduct = lockedProductById.get(item.product_id);
            if (!lockedProduct) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ success: false, message: `Product "${item.name}" is no longer available.` });
            }

            const validation = validateOrderQuantity({
                quantity: item.quantity,
                minimumOrderQuantity: lockedProduct.minimum_order_quantity,
                maximumOrderQuantity: lockedProduct.maximum_order_quantity,
                // Availability check now nets out reserved_stock — units held
                // for someone else's unpaid online order are not available to
                // this checkout, even though they still physically exist in
                // stock_quantity. See services/inventoryService.js.
                availableStock: inventoryService.availableStockOf(lockedProduct),
                isActive: lockedProduct.is_active === 1,
                unit: item.unit
            });

            if (!validation.valid) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    success: false,
                    message: `"${item.name}": ${validation.message}`,
                    code: validation.code
                });
            }

            const fallbackPrice = item.discount_price ? parseFloat(item.discount_price) : parseFloat(item.price);
            const { price: effectivePrice } = resolveEffectivePrice({
                quantity: item.quantity,
                tiers: tiersByProductId.get(item.product_id) || [],
                fallbackPrice
            });
            const totalItemPrice = effectivePrice * item.quantity;
            subtotal += totalItemPrice;

            orderItemsToInsert.push({
                product_id: item.product_id,
                product_name: item.name,
                sku: item.sku,
                unit: item.unit,
                price: effectivePrice,
                quantity: item.quantity,
                total_price: totalItemPrice
            });
        }

        // Shipping charge — Phase 7: computed centrally via shippingService
        // from the zone/pincode this order is actually going to (with any
        // per-pincode override), not a single flat global number. The
        // `shipping_settings` row still supplies the site-wide free-shipping
        // threshold, which is genuinely global policy rather than
        // zone-specific. Also enforces this pincode's minimum order amount
        // (serviceable_pincodes.min_order_override), if the admin set one —
        // e.g. a far-out delivery zone that's only economical above a
        // certain basket size.
        const [shipSettingsRows] = await connection.query('SELECT * FROM shipping_settings WHERE id = 1');
        const shippingSettings = shipSettingsRows.length > 0 ? shipSettingsRows[0] : { free_shipping_threshold: 500 };
        const shippingCalc = shippingService.calculateShipping({ subtotal, deliveryLocation, shippingSettings });

        if (!shippingCalc.meetsMinOrder) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: `This delivery area requires a minimum order value of Rs. ${shippingCalc.minOrderRequired.toFixed(2)}. Your current subtotal is Rs. ${subtotal.toFixed(2)}.`,
                code: 'MIN_ORDER_NOT_MET'
            });
        }

        const shippingCharge = shippingCalc.shippingCharge;

        // Handle Coupon Discount
        let discountAmount = 0.00;
        if (coupon_code) {
            const [coupons] = await connection.query('SELECT * FROM coupons WHERE code = ? AND is_active = 1', [coupon_code.toUpperCase()]);
            if (coupons.length > 0) {
                const c = coupons[0];
                if (c.discount_type === 'percentage') {
                    discountAmount = (subtotal * parseFloat(c.discount_value)) / 100;
                    if (c.max_discount && discountAmount > parseFloat(c.max_discount)) {
                        discountAmount = parseFloat(c.max_discount);
                    }
                } else {
                    discountAmount = parseFloat(c.discount_value);
                }
            }
        }

        const grandTotal = Math.max(0, subtotal - discountAmount + shippingCharge);

        const initialStatus = payment_method === 'cod' ? 'Confirmed' : 'Pending';
        const paymentStatus = payment_method === 'cod' ? 'pending' : 'pending';

        // Online orders get a reservation deadline; COD orders never reserve
        // (they sell directly, see the item-insert loop below), so they have
        // no reservation to expire.
        const reservationExpiresAt = payment_method === 'online'
            ? new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000)
            : null;

        // Insert Order with a temporary unique order_number (the column is NOT NULL
        // UNIQUE), then immediately rename it using the row's own auto-increment id —
        // which MySQL guarantees is unique — so no two concurrent orders can ever
        // collide on the same order number.
        const [orderResult] = await connection.query(
            `INSERT INTO orders (
                order_number, user_id, address_id, shipping_full_name, shipping_phone,
                shipping_address_text, subtotal, discount_amount, coupon_code,
                shipping_charge, total_amount, payment_method, payment_status, order_status, notes,
                reservation_expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                buildTempOrderNumber(), userId, address_id, addr.full_name, addr.phone,
                shippingAddressText, subtotal, discountAmount, coupon_code,
                shippingCharge, grandTotal, payment_method, paymentStatus, initialStatus, notes,
                reservationExpiresAt
            ]
        );

        const orderId = orderResult.insertId;
        const orderNumber = buildOrderNumber(orderId);
        await connection.query('UPDATE orders SET order_number = ? WHERE id = ?', [orderNumber, orderId]);

        // Insert Order Items, then move stock accordingly:
        //   COD    -> sellDirect (available -> sold immediately; no reservation
        //             phase, since COD has no separate payment-capture step to
        //             wait for — see inventoryService.sellDirect).
        //   online -> reserveStock (available -> reserved; converted to sold
        //             later in paymentController.verifyPayment once payment is
        //             actually confirmed, or released back to available if
        //             payment fails/expires/is cancelled).
        // Both run inside this same DB transaction as the order/order_items
        // inserts — order creation and its stock effect always commit or
        // roll back together, so a failure here can never leave "stock moved,
        // no order" or "order exists, stock untouched" (see also the
        // catch block below, which rolls back this entire transaction).
        for (const oi of orderItemsToInsert) {
            await connection.query(
                `INSERT INTO order_items (order_id, product_id, product_name, sku, unit, price, quantity, total_price)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, oi.product_id, oi.product_name, oi.sku, oi.unit, oi.price, oi.quantity, oi.total_price]
            );

            const lockedProduct = lockedProductById.get(oi.product_id);
            if (payment_method === 'cod') {
                await inventoryService.sellDirect(connection, {
                    lockedProduct,
                    quantity: oi.quantity,
                    orderId,
                    createdBy: req.user.full_name
                });
            } else {
                await inventoryService.reserveStock(connection, {
                    lockedProduct,
                    quantity: oi.quantity,
                    orderId,
                    createdBy: req.user.full_name
                });
            }
        }

        // Insert Order Status History
        await insertHistory(connection, {
            orderId,
            oldStatus: null, // genuinely no prior status — this is the order's first row
            newStatus: initialStatus,
            comment: `Order created via ${payment_method.toUpperCase()}`,
            createdBy: req.user.full_name
        });

        // Record Coupon Usage if applied
        if (coupon_code) {
            const [cRows] = await connection.query('SELECT id FROM coupons WHERE code = ?', [coupon_code.toUpperCase()]);
            if (cRows.length > 0) {
                await connection.query('INSERT INTO coupon_usage (coupon_id, user_id, order_id) VALUES (?, ?, ?)', [cRows[0].id, userId, orderId]);
            }
        }

        // Clear Cart
        await connection.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);

        await connection.commit();
        connection.release();

        const createdOrderData = {
            id: orderId,
            order_number: orderNumber,
            subtotal,
            discount_amount: discountAmount,
            shipping_charge: shippingCharge,
            total_amount: grandTotal,
            payment_method,
            payment_status: paymentStatus,
            order_status: initialStatus,
            shipping_address_text: shippingAddressText,
            reservation_expires_at: reservationExpiresAt,
            created_at: new Date()
        };

        // Generate Invoice (Phase 8)
        // For COD orders, the invoice is finalized immediately since
        // payment is confirmed on delivery. For online orders, the invoice
        // is also created here with payment_status='pending' — it will be
        // updated to 'paid' when payment is captured via verifyPayment/webhook.
        // Done outside the transaction (after commit) — the invoice row is
        // created in its own mini-transaction so a failure here doesn't
        // roll back the order itself.
        try {
            const invoiceConn = await pool.getConnection();
            try {
                await invoiceConn.beginTransaction();
                const [userRows] = await invoiceConn.query(
                    'SELECT full_name, email, phone FROM users WHERE id = ?',
                    [userId]
                );
                const userSnapshot = userRows[0] || {};
                await invoiceService.finalizeInvoice(invoiceConn, {
                    orderId,
                    order: {
                        ...createdOrderData,
                        user_name: userSnapshot.full_name || addr.full_name,
                        user_email: userSnapshot.email,
                        customer_gstin: addr.gstin || null
                    },
                    items: orderItemsToInsert,
                    createdBy: req.user.full_name
                });
                await invoiceConn.commit();
            } catch (invoiceErr) {
                await invoiceConn.rollback();
                logger.error({ err: invoiceErr, orderId }, 'Failed to generate invoice — order was still created successfully.');
            } finally {
                invoiceConn.release();
            }
        } catch (connErr) {
            logger.error({ err: connErr, orderId }, 'Failed to get connection for invoice generation.');
        }

        // COD is confirmed when this order is created. Online orders send
        // their confirmation only after Razorpay capture succeeds.
        if (payment_method === 'cod') {
            sendAdminNewOrderEmail(createdOrderData, orderItemsToInsert, req.user);
            sendCustomerOrderEmail(createdOrderData, orderItemsToInsert, req.user);
        }

        return res.status(201).json({
            success: true,
            message: 'Order created successfully!',
            order: createdOrderData
        });

    } catch (error) {
        await connection.rollback();
        connection.release();
        logger.error({ err: error }, 'Create order error');
        return res.status(500).json({ success: false, message: 'Error processing order placement.' });
    }
};

// Get Customer Orders
const getCustomerOrders = async (req, res) => {
    try {
        const [orders] = await pool.query(
            `SELECT o.*, COUNT(oi.id) as item_count
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             WHERE o.user_id = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [req.user.id]
        );
        return res.json({ success: true, orders });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching orders.' });
    }
};

// Get Single Order Detail & Tracking Info
const getOrderDetail = async (req, res) => {
    try {
        const orderId = req.params.id;
        const isNumeric = !isNaN(orderId);
        const whereClause = isNumeric ? 'o.id = ?' : 'o.order_number = ?';

        const [orders] = await pool.query(
            `SELECT o.*, u.full_name as user_name, u.email as user_email, u.phone as user_phone
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE ${whereClause}`,
            [orderId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const order = orders[0];

        // Security check: non-admin can only view their own order
        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const [items] = await pool.query(
            `SELECT oi.*, p.thumbnail, p.slug
             FROM order_items oi
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?
             ORDER BY oi.id ASC`,
            [order.id]
        );

        const [history] = await pool.query(
            'SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC',
            [order.id]
        );

        // Refund/cancellation state (Phase 6 — "cancellation/refund state" is
        // an explicit admin UI requirement, and useful to a customer too so
        // they can see a refund's actual progress rather than just "paid").
        const [refunds] = await pool.query(
            'SELECT * FROM refunds WHERE order_id = ? ORDER BY created_at DESC',
            [order.id]
        );

        return res.json({
            success: true,
            order,
            items,
            statusHistory: history,
            refunds,
            // What the requester (this order's owner, or any admin) may
            // still do from here — lets the frontend show/hide Cancel /
            // Request Return without duplicating orderStateMachine's rules.
            actions: {
                canCancel: orderStateMachine.getCancellationDecision({ status: order.order_status, role: req.user.role }).allowed
                    && order.order_status !== 'Cancelled',
                canPartiallyCancel: orderStateMachine.canPartiallyCancel(order.order_status)
                    && orderStateMachine.getCancellationDecision({ status: order.order_status, role: req.user.role }).allowed,
                canRequestReturn: order.order_status === 'Delivered',
                allowedNextStatuses: orderStateMachine.getAllowedNext(order.order_status)
            }
        });
    } catch (error) {
        logger.error({ err: error }, 'Get order detail error');
        return res.status(500).json({ success: false, message: 'Error fetching order details.' });
    }
};

// Admin: Get all orders with search and status filters
const getAdminOrders = async (req, res) => {
    try {
        const { status, payment_status, search } = req.query;
        let whereClauses = [];
        let params = [];

        if (status) {
            whereClauses.push('o.order_status = ?');
            params.push(status);
        }

        if (payment_status) {
            whereClauses.push('o.payment_status = ?');
            params.push(payment_status);
        }

        if (search) {
            whereClauses.push('(o.order_number LIKE ? OR o.shipping_full_name LIKE ? OR o.shipping_phone LIKE ?)');
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        const [orders] = await pool.query(
            `SELECT o.*, u.full_name as user_name, u.email as user_email
             FROM orders o
             JOIN users u ON o.user_id = u.id
             ${whereSql}
             ORDER BY o.created_at DESC`,
            params
        );

        return res.json({ success: true, orders });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching admin orders.' });
    }
};

// Shared by updateOrderStatus (admin, order_status -> 'Cancelled') and
// cancelOrder (customer/admin explicit cancel before payment). Restores
// inventory correctly depending on where the order was in its lifecycle —
// this is the "don't leave stock reserved without an order / stock sold
// without an order" guarantee applied to cancellation, which the pre-Phase-4
// code didn't handle at all (order_status could be set to 'Cancelled' with
// no inventory effect whatsoever).
//   - Still holding a reservation (online, never paid)        -> RELEASE
//   - Already sold (COD, or online already paid)               -> RETURN (restock)
// Runs inside the caller's own open transaction/connection.
const restockCancelledOrder = async (connection, { order, items, createdBy }) => {
    const productIds = items.map((i) => i.product_id);
    const lockedById = await inventoryService.lockProductsForUpdate(connection, productIds);

    const wasReservedOnly = order.payment_method === 'online' && order.payment_status !== 'paid';

    for (const item of items) {
        const lockedProduct = lockedById.get(item.product_id);
        if (!lockedProduct) continue; // product hard-deleted — RESTRICT FK makes this unreachable in practice

        if (wasReservedOnly) {
            await inventoryService.releaseReservation(connection, {
                lockedProduct,
                quantity: item.quantity,
                orderId: order.id,
                createdBy,
                notes: 'Order cancelled before payment — reservation released.'
            });
        } else {
            await inventoryService.restockReturn(connection, {
                lockedProduct,
                quantity: item.quantity,
                orderId: order.id,
                createdBy,
                notes: 'Order cancelled after stock was already sold — restocked.'
            });
        }
    }
};

// Customer or Admin: Cancel an order before/without waiting for the
// reservation to expire on its own — releases held stock (or restocks sold
// stock) immediately instead of leaving it locked up for up to
// RESERVATION_TTL_MINUTES. This is also what the frontend should call from
// the Razorpay checkout modal's `payment.failed` / dismiss handlers, so a
// customer who backs out of paying doesn't have to wait for the timer.
// Partial cancellation (Phase 6): releases/restocks and marks
// `cancelled_quantity` for exactly the requested quantities on exactly the
// requested order_items — never the whole order, and never touching
// `quantity`/`price`/`total_price` on those rows (historical integrity: the
// item still honestly records what was originally ordered and charged).
// Returns the total amount (in rupees) that is now refundable because of
// this partial cancellation, and whether every item on the order has now
// been fully cancelled (in which case the caller should escalate to a full
// order cancellation).
const applyPartialCancellation = async (connection, { order, requestedItems, createdBy }) => {
    if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
        const err = new Error('items must be a non-empty array of { order_item_id, quantity }.');
        err.status = 400;
        throw err;
    }

    const [allItems] = await connection.query(
        'SELECT id, product_id, quantity, cancelled_quantity, returned_quantity, price FROM order_items WHERE order_id = ? ORDER BY id ASC',
        [order.id]
    );
    const itemById = new Map(allItems.map((i) => [i.id, i]));

    // Validate every requested line before mutating anything — a partially
    // applied partial-cancel (some lines adjusted, one rejected) would be
    // worse than rejecting the whole request up front.
    const toApply = [];
    for (const req of requestedItems) {
        const orderItemId = Number(req.order_item_id);
        const qty = Number(req.quantity);
        const item = itemById.get(orderItemId);
        if (!item) {
            const err = new Error(`Order item ${req.order_item_id} does not belong to this order.`);
            err.status = 400;
            throw err;
        }
        if (!Number.isInteger(qty) || qty <= 0) {
            const err = new Error(`Invalid cancel quantity for order item ${orderItemId}.`);
            err.status = 400;
            throw err;
        }
        const remaining = item.quantity - item.cancelled_quantity - item.returned_quantity;
        if (qty > remaining) {
            const err = new Error(`Cannot cancel ${qty} of order item ${orderItemId} — only ${remaining} remain active.`);
            err.status = 400;
            throw err;
        }
        toApply.push({ item, qty });
    }

    const productIds = toApply.map(({ item }) => item.product_id);
    const lockedById = await inventoryService.lockProductsForUpdate(connection, productIds);

    const wasReservedOnly = order.payment_method === 'online' && order.payment_status !== 'paid';
    let refundableAmount = 0;

    for (const { item, qty } of toApply) {
        const lockedProduct = lockedById.get(item.product_id);
        if (lockedProduct) {
            if (wasReservedOnly) {
                await inventoryService.releaseReservation(connection, {
                    lockedProduct, quantity: qty, orderId: order.id, createdBy,
                    notes: `Partial cancellation — ${qty} unit(s) released.`
                });
            } else {
                await inventoryService.restockReturn(connection, {
                    lockedProduct, quantity: qty, orderId: order.id, createdBy,
                    notes: `Partial cancellation — ${qty} unit(s) restocked.`
                });
            }
        }
        await connection.query(
            'UPDATE order_items SET cancelled_quantity = cancelled_quantity + ? WHERE id = ?',
            [qty, item.id]
        );
        refundableAmount += qty * parseFloat(item.price);
    }

    const [freshItems] = await connection.query(
        'SELECT quantity, cancelled_quantity, returned_quantity FROM order_items WHERE order_id = ?',
        [order.id]
    );
    const allFullyCancelledOrReturned = freshItems.every((i) => i.cancelled_quantity + i.returned_quantity >= i.quantity);

    return { refundableAmount, allFullyCancelledOrReturned };
};

// Customer or Admin: Cancel an order before/without waiting for the
// reservation to expire on its own — releases held stock (or restocks sold
// stock) immediately instead of leaving it locked up for up to
// RESERVATION_TTL_MINUTES. This is also what the frontend should call from
// the Razorpay checkout modal's `payment.failed` / dismiss handlers, so a
// customer who backs out of paying doesn't have to wait for the timer.
//
// Phase 6: also accepts an optional `items: [{ order_item_id, quantity }]`
// body for a PARTIAL cancellation — cancelling only some units of some
// lines rather than the whole order (see applyPartialCancellation above),
// gated separately by orderStateMachine.canPartiallyCancel since it's only
// safe before packing has physically begun.
const cancelOrder = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const orderId = req.params.id;
        const [orders] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        const order = orders[0];

        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            await connection.rollback();
            connection.release();
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        // Idempotent: cancelling an already-cancelled order is a no-op
        // success, not an error (covers duplicate cancel requests, e.g. both
        // `payment.failed` and a manual "cancel" click firing).
        if (order.order_status === 'Cancelled') {
            await connection.commit();
            connection.release();
            return res.json({ success: true, message: 'Order already cancelled.' });
        }

        // Phase 6: cancellation eligibility is now a single, configurable
        // policy (services/orderStateMachine.js) instead of a hardcoded
        // terminal-status list — e.g. a customer can no longer self-cancel
        // an order that's already 'Processing'/'Packed'/'Shipped' (they
        // could before Phase 6, which the spec explicitly calls out as
        // something that must be restricted), while an admin still can.
        const decision = orderStateMachine.getCancellationDecision({ status: order.order_status, role: req.user.role });
        if (!decision.allowed) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: decision.reason });
        }

        const reason = req.body.reason || 'Order cancelled by ' + (req.user.role === 'admin' ? 'admin' : 'customer');
        const wasPaid = order.payment_status === 'paid';

        // --- Partial cancellation branch -----------------------------------
        if (Array.isArray(req.body.items) && req.body.items.length > 0) {
            if (!orderStateMachine.canPartiallyCancel(order.order_status)) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    success: false,
                    message: `Orders in "${order.order_status}" status can no longer be partially cancelled — packing may already be underway.`
                });
            }

            let result;
            try {
                result = await applyPartialCancellation(connection, { order, requestedItems: req.body.items, createdBy: req.user.full_name });
            } catch (err) {
                await connection.rollback();
                connection.release();
                return res.status(err.status || 400).json({ success: false, message: err.message });
            }

            // If every line is now fully cancelled/returned, this partial
            // request has emptied the order — escalate to a full cancel so
            // the order doesn't sit indefinitely at its current status with
            // nothing left to fulfil. Inventory for every line was already
            // released/restocked line-by-line above, so this only updates
            // order-level status/history — never restockCancelledOrder again.
            const newOrderStatus = result.allFullyCancelledOrReturned ? 'Cancelled' : order.order_status;
            if (result.allFullyCancelledOrReturned) {
                orderStateMachine.assertValidTransition(order.order_status, 'Cancelled');
                await connection.query(
                    `UPDATE orders SET order_status = 'Cancelled', payment_status = CASE WHEN payment_status = 'paid' THEN 'paid' ELSE 'failed' END WHERE id = ?`,
                    [orderId]
                );
            }

            await insertHistory(connection, {
                orderId,
                oldStatus: order.order_status,
                newStatus: newOrderStatus,
                comment: `${reason} (partial cancellation: ₹${result.refundableAmount.toFixed(2)} across ${req.body.items.length} line item(s))`,
                createdBy: req.user.full_name
            });

            await connection.commit();
            connection.release();

            if (wasPaid && result.refundableAmount > 0) {
                triggerAutoRefund({
                    order: { ...order, order_status: newOrderStatus },
                    amount: result.refundableAmount,
                    reason: `Partial cancellation — ${reason}`,
                    initiatedBy: req.user.full_name,
                    restock: false // already restocked per-line above
                });
            }

            return res.json({
                success: true,
                message: wasPaid && result.refundableAmount > 0
                    ? `Partially cancelled. A refund of ₹${result.refundableAmount.toFixed(2)} has been requested.`
                    : 'Order partially cancelled.',
                fullyCancelled: result.allFullyCancelledOrReturned,
                refundableAmount: result.refundableAmount
            });
        }

        // --- Full order cancellation branch ---------------------------------
        orderStateMachine.assertValidTransition(order.order_status, 'Cancelled');

        const [items] = await connection.query(
            'SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id ASC',
            [orderId]
        );

        await restockCancelledOrder(connection, { order, items, createdBy: req.user.full_name });

        // Phase 5: cancelling an order that was already PAID must never
        // flip payment_status straight to 'refunded' here — that would be
        // exactly the "marked refunded merely because a button was
        // clicked" anti-pattern the production hardening spec forbids.
        // Money has not moved yet. Instead: leave payment_status at 'paid'
        // (order_status still moves to 'Cancelled' immediately, so the
        // order stops being actionable/shippable) and kick off a REAL
        // Razorpay refund for the full amount right after this commits —
        // the order will only actually read as refunded once
        // controllers/webhookController.js's refund.processed handler
        // confirms it. Inventory was already restocked above by
        // restockCancelledOrder, so that auto-refund must NOT restock a
        // second time.
        await connection.query(
            `UPDATE orders SET order_status = 'Cancelled', payment_status = CASE WHEN payment_status = 'paid' THEN 'paid' ELSE 'failed' END WHERE id = ?`,
            [orderId]
        );
        await insertHistory(connection, { orderId, oldStatus: order.order_status, newStatus: 'Cancelled', comment: reason, createdBy: req.user.full_name });

        await connection.commit();
        connection.release();

        if (wasPaid) {
            triggerAutoRefund({
                order: { ...order, order_status: 'Cancelled' },
                amount: null, // full remaining amount
                reason: `Automatic refund — ${reason}`,
                initiatedBy: req.user.full_name,
                restock: false // already restocked above, in this same request
            });
        }

        return res.json({
            success: true,
            message: wasPaid
                ? 'Order cancelled. A refund has been requested and will be confirmed once Razorpay processes it.'
                : 'Order cancelled.'
        });
    } catch (error) {
        await connection.rollback();
        connection.release();
        if (error instanceof orderStateMachine.OrderTransitionError) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        logger.error({ err: error }, 'Cancel order error');
        return res.status(500).json({ success: false, message: 'Error cancelling order.' });
    }
};

// Customer: request a return on a Delivered order. Does NOT restock or
// refund anything by itself — it only opens a 'Return Requested' state for
// an admin to approve (-> 'Returned', restocks + refunds) or reject (->
// back to 'Delivered'). See updateOrderStatus. This is the missing
// customer-facing half of "Delivered → return process" — previously only
// an admin could ever move an order to 'Returned', with no way for a
// customer to initiate one and no intermediate request/approval state.
const requestReturn = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const orderId = req.params.id;
        const [orders] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        const order = orders[0];

        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            await connection.rollback();
            connection.release();
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        try {
            orderStateMachine.assertValidTransition(order.order_status, 'Return Requested');
        } catch (err) {
            await connection.rollback();
            connection.release();
            return res.status(err.status || 400).json({ success: false, message: err.message });
        }

        // Return window — derived from the latest 'Delivered' history entry
        // rather than a new orders column (see orderStateMachine.RETURN_WINDOW_DAYS).
        const [[deliveredEntry]] = await connection.query(
            `SELECT created_at FROM order_status_history WHERE order_id = ? AND status = 'Delivered' ORDER BY created_at DESC LIMIT 1`,
            [orderId]
        );
        if (deliveredEntry) {
            const daysSinceDelivery = (Date.now() - new Date(deliveredEntry.created_at).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceDelivery > orderStateMachine.RETURN_WINDOW_DAYS) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({
                    success: false,
                    message: `The return window (${orderStateMachine.RETURN_WINDOW_DAYS} days after delivery) has passed for this order.`
                });
            }
        }

        const reason = (req.body.reason || '').trim();
        if (!reason) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Please provide a reason for the return.' });
        }

        await connection.query(`UPDATE orders SET order_status = 'Return Requested' WHERE id = ?`, [orderId]);
        await insertHistory(connection, {
            orderId, oldStatus: order.order_status, newStatus: 'Return Requested',
            comment: reason, createdBy: req.user.full_name
        });

        await connection.commit();
        connection.release();

        return res.json({ success: true, message: 'Return requested. Our team will review it shortly.' });
    } catch (error) {
        await connection.rollback();
        connection.release();
        logger.error({ err: error }, 'Request return error');
        return res.status(500).json({ success: false, message: 'Error requesting return.' });
    }
};

// Admin: Update Order Status & Shipping Tracking Info
const updateOrderStatus = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const orderId = req.params.id;
        const { order_status, payment_status, courier_provider, tracking_number, estimated_delivery_date, comment } = req.body;

        // Phase 5: this endpoint must never be the thing that marks a
        // payment refunded — that would be "an admin clicked a frontend
        // button" deciding the refund happened, which is exactly what the
        // production hardening spec forbids. Refunds only ever get here
        // through POST /api/payments/admin/orders/:id/refund (which only
        // *requests* a refund) confirmed by a `refund.processed` webhook
        // (which is the only thing allowed to write these statuses).
        if (payment_status && ['refunded', 'partially_refunded'].includes(payment_status)) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'payment_status cannot be set to refunded directly. Use POST /api/payments/admin/orders/:id/refund to request a real Razorpay refund — the order updates automatically once Razorpay confirms it.'
            });
        }

        const [orders] = await connection.query(
            'SELECT o.*, u.full_name, u.email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ? FOR UPDATE',
            [orderId]
        );
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const currOrder = orders[0];
        const nextOrderStatus = order_status || currOrder.order_status;

        // Phase 6: validate the transition before doing any work
        if (order_status && order_status !== currOrder.order_status) {
            try {
                orderStateMachine.assertValidTransition(currOrder.order_status, nextOrderStatus);
            } catch (err) {
                await connection.rollback();
                connection.release();
                return res.status(err.status || 400).json({ success: false, message: err.message });
            }
        }

        // Inventory side-effects of a status transition — same
        // reserve/sell/restock rules as cancelOrder, applied here so an
        // admin manually moving an order to Cancelled/Returned through this
        // endpoint gets the exact same stock guarantees as the dedicated
        // cancel endpoint (no stock left reserved-without-an-order, no
        // physically-returned stock left un-restocked).
        const [items] = await connection.query(
            'SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id ASC',
            [orderId]
        );

        if (nextOrderStatus === 'Cancelled' && currOrder.order_status !== 'Cancelled') {
            await restockCancelledOrder(connection, { order: currOrder, items, createdBy: req.user.full_name });
        } else if (nextOrderStatus === 'Returned' && currOrder.order_status !== 'Returned') {
            // Physical goods came back — restock regardless of how the order
            // got here (it was necessarily already sold to reach 'Delivered'
            // in the first place).
            const lockedById = await inventoryService.lockProductsForUpdate(connection, items.map((i) => i.product_id));
            for (const item of items) {
                const lockedProduct = lockedById.get(item.product_id);
                if (!lockedProduct) continue;
                await inventoryService.restockReturn(connection, {
                    lockedProduct,
                    quantity: item.quantity,
                    orderId,
                    createdBy: req.user.full_name,
                    notes: comment || 'Order returned — goods restocked.'
                });
            }
        }
        // NOTE: there used to be a third branch here that set
        // payment_status to 'refunded' directly from this endpoint and
        // logged an informational inventory entry. Phase 5 removed it —
        // payment_status can no longer reach 'refunded'/'partially_refunded'
        // through this endpoint at all (guarded above), and the
        // corresponding inventory logging now happens inside
        // services/refundService.js's finalizeRefund, driven by a real,
        // webhook-verified Razorpay refund instead of an admin form field.

        await connection.query(
            `UPDATE orders
             SET order_status = ?,
                 payment_status = COALESCE(?, payment_status),
                 courier_provider = COALESCE(?, courier_provider),
                 tracking_number = COALESCE(?, tracking_number),
                 estimated_delivery_date = COALESCE(?, estimated_delivery_date)
             WHERE id = ?`,
            [
                nextOrderStatus,
                payment_status || null,
                courier_provider || null,
                tracking_number || null,
                estimated_delivery_date || null,
                orderId
            ]
        );

        // Record history
        if (order_status && order_status !== currOrder.order_status) {
            await insertHistory(connection, {
                orderId,
                oldStatus: currOrder.order_status,
                newStatus: order_status,
                comment: comment || `Status updated to ${order_status}`,
                createdBy: req.user.full_name
            });
        }

        await connection.commit();
        connection.release();

        // Send Email Notification to Customer (after commit — never let a
        // slow/failing email provider hold the DB transaction open)
        if (order_status && order_status !== currOrder.order_status) {
            sendCustomerStatusEmail(
                { ...currOrder, courier_provider, tracking_number },
                order_status,
                { full_name: currOrder.full_name, email: currOrder.email }
            );
        }

        return res.json({ success: true, message: 'Order status updated successfully.' });
    } catch (error) {
        await connection.rollback();
        connection.release();
        logger.error({ err: error }, 'Update order status error');
        return res.status(500).json({ success: false, message: 'Error updating order status.' });
    }
};

// Escapes text before it's interpolated into the invoice HTML below —
// order data (shipping name/address, product names, notes) ultimately
// comes from user-controlled input (checkout form, product catalog), so
// this is the only thing standing between an order and a stored-XSS
// invoice if any of those fields ever contain HTML.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const money = (value) => `Rs. ${parseFloat(value || 0).toFixed(2)}`;

// Customer & Admin: a self-contained, printable HTML invoice for one order.
// Deliberately NOT a generated PDF file on disk — everything it shows is
// read fresh from `orders`/`order_items` on every request (never a stored,
// separately-maintained document), so it can never drift from the
// historical order record and needs no cleanup/storage story of its own.
// The browser's native "Print -> Save as PDF" turns this into a PDF when
// the customer wants a file. Line items intentionally show each item's
// ORIGINAL quantity/price/total (the immutable snapshot from checkout —
// see historical-integrity note in migrations/024_orderLifeCycleHardening.js)
// with cancelled/returned quantities called out separately, rather than
// silently shrinking the line to reflect only what's still active.
const getOrderInvoice = async (req, res) => {
    try {
        const orderId = req.params.id;
        const isNumeric = !isNaN(orderId);
        const whereClause = isNumeric ? 'o.id = ?' : 'o.order_number = ?';

        const [orders] = await pool.query(
            `SELECT o.*, u.full_name as user_name, u.email as user_email, u.phone as user_phone
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE ${whereClause}`,
            [orderId]
        );
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        const order = orders[0];

        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const [items] = await pool.query(
            'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
            [order.id]
        );

        const itemRows = items.map((item) => {
            const active = item.quantity - (item.cancelled_quantity || 0) - (item.returned_quantity || 0);
            const notes = [];
            if (item.cancelled_quantity > 0) notes.push(`${item.cancelled_quantity} cancelled`);
            if (item.returned_quantity > 0) notes.push(`${item.returned_quantity} returned`);
            return `
                <tr>
                    <td>${escapeHtml(item.product_name)}<div class="sub">SKU: ${escapeHtml(item.sku)}${notes.length ? ` &middot; ${escapeHtml(notes.join(', '))}` : ''}</div></td>
                    <td class="num">${item.quantity} ${escapeHtml(item.unit)}</td>
                    <td class="num">${money(item.price)}</td>
                    <td class="num">${money(item.total_price)}</td>
                </tr>`;
        }).join('');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Invoice ${escapeHtml(order.order_number)}</title>
<style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; max-width: 800px; margin: 32px auto; padding: 0 24px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1F4D36; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 22px; font-weight: 800; color: #1F4D36; }
    .brand .tag { font-size: 11px; font-weight: 400; color: #666; display: block; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { margin: 0; font-size: 20px; color: #1F4D36; }
    .invoice-title .meta { font-size: 12px; color: #555; margin-top: 4px; }
    .grid { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
    .box { flex: 1; }
    .box h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; }
    .box p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { text-align: left; background: #f4f1e8; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #555; }
    td { padding: 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    .sub { font-size: 11px; color: #888; margin-top: 2px; }
    .totals { width: 260px; margin-left: auto; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { border-top: 2px solid #1F4D36; margin-top: 6px; padding-top: 8px; font-weight: 800; font-size: 15px; color: #1F4D36; }
    .status-row { display: flex; gap: 12px; margin: 20px 0; }
    .pill { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #eef6f0; color: #1F4D36; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #888; text-align: center; }
    .print-btn { position: fixed; top: 16px; right: 16px; padding: 8px 16px; background: #1F4D36; color: #fff; border: none; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; }
    @media print { .print-btn { display: none; } body { margin: 0 auto; } }
</style>
</head>
<body>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>

    <div class="header">
        <div class="brand">Mandi Connect<span class="tag">Fresh produce, sourced directly from the mandi</span></div>
        <div class="invoice-title">
            <h1>INVOICE</h1>
            <div class="meta">Order #${escapeHtml(order.order_number)}</div>
            <div class="meta">Date: ${new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
    </div>

    <div class="grid">
        <div class="box">
            <h4>Billed / Shipped To</h4>
            <p><strong>${escapeHtml(order.shipping_full_name)}</strong></p>
            <p>${escapeHtml(order.shipping_address_text)}</p>
            <p>Phone: ${escapeHtml(order.shipping_phone)}</p>
            <p>Email: ${escapeHtml(order.user_email)}</p>
        </div>
        <div class="box">
            <h4>Payment</h4>
            <p>Method: <strong>${escapeHtml((order.payment_method || '').toUpperCase())}</strong></p>
            <p>Status: <strong>${escapeHtml((order.payment_status || '').replace('_', ' ').toUpperCase())}</strong></p>
            ${order.coupon_code ? `<p>Coupon Applied: <strong>${escapeHtml(order.coupon_code)}</strong></p>` : ''}
        </div>
    </div>

    <div class="status-row">
        <span class="pill">Order Status: ${escapeHtml(order.order_status)}</span>
    </div>

    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th class="num">Qty</th>
                <th class="num">Unit Price</th>
                <th class="num">Amount</th>
            </tr>
        </thead>
        <tbody>
            ${itemRows}
        </tbody>
    </table>

    <div class="totals">
        <div><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
        ${parseFloat(order.discount_amount) > 0 ? `<div><span>Discount${order.coupon_code ? ` (${escapeHtml(order.coupon_code)})` : ''}</span><span>-${money(order.discount_amount)}</span></div>` : ''}
        <div><span>Shipping</span><span>${parseFloat(order.shipping_charge) > 0 ? money(order.shipping_charge) : 'FREE'}</span></div>
        ${parseFloat(order.tax_amount) > 0 ? `<div><span>Tax</span><span>${money(order.tax_amount)}</span></div>` : ''}
        <div class="grand"><span>Total</span><span>${money(order.total_amount)}</span></div>
    </div>

    <div class="footer">
        This is a system-generated invoice for order #${escapeHtml(order.order_number)} and does not require a physical signature.<br />
        For questions about this order, contact support with the order number above.
    </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (error) {
        logger.error({ err: error }, 'Get order invoice error');
        return res.status(500).json({ success: false, message: 'Error generating invoice.' });
    }
};

module.exports = {
    createOrder,
    getCustomerOrders,
    getOrderDetail,
    getAdminOrders,
    updateOrderStatus,
    cancelOrder,
    requestReturn,
    getOrderInvoice
};