/**
 * inventoryService.js — the single place that reads/writes
 * products.stock_quantity, products.reserved_stock, and writes
 * inventory_transactions rows. Phase 4 requirement.
 *
 * Every function here takes an already-open `connection`
 * (pool.getConnection() + beginTransaction() done by the caller) and never
 * commits/rollbacks itself — that stays the caller's responsibility, same
 * convention as the rest of this codebase (orderController, paymentController,
 * productController all follow this pattern already). This keeps a whole
 * business operation (e.g. "reserve every item in the cart, then insert the
 * order") atomic: either every stock mutation + every order row commits
 * together, or none of it does.
 *
 * Concurrency: every mutating function here assumes the caller has ALREADY
 * locked the relevant products row(s) with `SELECT ... FOR UPDATE` in this
 * same transaction (orderController/paymentController do this once per
 * checkout/payment for every product in the cart, in ascending product_id
 * order, specifically to avoid deadlocks between two concurrent checkouts
 * that share products — see orderController.createOrder's comment). This
 * service does not re-lock, both to avoid a redundant round trip and
 * because re-locking here in a different order than the caller's own outer
 * loop could reintroduce the exact deadlock risk the caller was avoiding.
 * Callers MUST pass the already-locked row's current stock_quantity /
 * reserved_stock as `lockedProduct` — never a stale, unlocked read.
 *
 * Vocabulary (see migrations/020_productsReservedStock.js for the full
 * reasoning):
 *   stock_quantity   total stock currently owned, not yet sold
 *   reserved_stock   held against unpaid online orders (not yet sold, not
 *                    available to anyone else)
 *   available_stock  stock_quantity - reserved_stock (derived, never stored)
 *   sold_stock       derived by summing inventory_transactions, never stored
 */

const logger = require('../utils/logger');

// How long an online order holds its stock reservation before it's swept
// back into general availability if payment never completes. Kept as a
// named constant (not scattered magic numbers) since both createOrder
// (sets the deadline) and the expiry sweep (enforces it) need the same
// value. 15 minutes covers a normal Razorpay checkout modal session with
// slack for a slow UPI/bank redirect.
const RESERVATION_TTL_MINUTES = Number(process.env.RESERVATION_TTL_MINUTES) || 15;

const availableStockOf = (product) => product.stock_quantity - product.reserved_stock;

/**
 * Locks every product row needed for a cart/order, in a single query, in
 * stable ascending id order — the ordering is what prevents two concurrent
 * checkouts that share two products (A, B) from deadlocking by locking them
 * in opposite order. Returns a Map<product_id, row>.
 *
 * This intentionally duplicates the FOR UPDATE query orderController already
 * ran before Phase 4 — it's kept as a shared helper now so paymentController
 * and the admin adjustment/cancel/return paths all lock the exact same way
 * rather than each hand-rolling their own lock query.
 */
const lockProductsForUpdate = async (connection, productIds) => {
    if (!productIds || productIds.length === 0) return new Map();
    const [rows] = await connection.query(
        `SELECT id, stock_quantity, reserved_stock, is_active, minimum_order_quantity, maximum_order_quantity
         FROM products WHERE id IN (?) ORDER BY id ASC FOR UPDATE`,
        [productIds]
    );
    return new Map(rows.map((r) => [r.id, r]));
};

/**
 * Appends one row to inventory_transactions. Never called directly by
 * controllers — always through one of the operations below, so
 * transaction_type/reference_type stay consistent with what actually
 * happened to the product row.
 */
const logTransaction = async (connection, {
    productId,
    transactionType,
    quantity,
    referenceType,
    referenceId = null,
    previousQuantity,
    newQuantity,
    createdBy = 'System',
    notes = null
}) => {
    await connection.query(
        `INSERT INTO inventory_transactions
            (product_id, transaction_type, quantity, reference_type, reference_id,
             previous_quantity, new_quantity, created_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [productId, transactionType, quantity, referenceType, referenceId,
            previousQuantity, newQuantity, createdBy, notes]
    );
};

/**
 * RESERVATION — online-payment checkout path. Holds `quantity` units
 * against an order awaiting payment. Caller must have already validated
 * MOQ/max/active via wholesale.validateOrderQuantity against
 * availableStockOf(lockedProduct) — this function re-checks availability
 * defensively but is not a substitute for that business-rule validation
 * (it has no idea what a product's MOQ is).
 *
 * Throws { code: 'INSUFFICIENT_STOCK' } rather than silently clamping —
 * a reservation must never partially succeed.
 */
const reserveStock = async (connection, { lockedProduct, quantity, orderId, createdBy }) => {
    const available = availableStockOf(lockedProduct);
    if (quantity > available) {
        const err = new Error(`Only ${available} units available to reserve.`);
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
    }

    const previous = lockedProduct.reserved_stock;
    const next = previous + quantity;

    await connection.query('UPDATE products SET reserved_stock = ? WHERE id = ?', [next, lockedProduct.id]);
    await logTransaction(connection, {
        productId: lockedProduct.id,
        transactionType: 'RESERVATION',
        quantity,
        referenceType: 'ORDER',
        referenceId: orderId,
        previousQuantity: previous,
        newQuantity: next,
        createdBy
    });

    // Keep the in-memory row consistent in case the same lockedProduct
    // object is reused for a second calculation later in the same request.
    lockedProduct.reserved_stock = next;
    return { previous, next };
};

/**
 * RELEASE — payment failed, expired, or the customer/admin cancelled an
 * order that was still holding a reservation. Floors at 0 defensively
 * (never throws) so a double-release (e.g. the expiry sweep and an
 * explicit cancel racing each other) can't push reserved_stock negative —
 * see chk_products_reserved_nonneg, which would otherwise reject the
 * UPDATE outright and crash an already-messy cleanup path.
 */
const releaseReservation = async (connection, { lockedProduct, quantity, orderId, createdBy, notes = null }) => {
    const previous = lockedProduct.reserved_stock;
    const releasable = Math.min(quantity, previous);
    const next = previous - releasable;

    if (releasable <= 0) {
        // Nothing to release (already released/settled) — log nothing, this
        // is expected on a double-release race, not an error.
        return { previous, next: previous, releasable: 0 };
    }

    await connection.query('UPDATE products SET reserved_stock = ? WHERE id = ?', [next, lockedProduct.id]);
    await logTransaction(connection, {
        productId: lockedProduct.id,
        transactionType: 'RELEASE',
        quantity: -releasable,
        referenceType: 'ORDER',
        referenceId: orderId,
        previousQuantity: previous,
        newQuantity: next,
        createdBy,
        notes
    });

    lockedProduct.reserved_stock = next;
    return { previous, next, releasable };
};

/**
 * SALE (from a prior reservation) — online payment just verified.
 * Converts a hold into an actual sale: releases the reservation AND
 * removes the stock from stock_quantity in the same operation (this is
 * fulfillment, not a release-then-separate-purchase, so it is logged as a
 * single SALE row, not RELEASE + SALE — see migrations/inventoryTransactions.js).
 *
 * Payment has already been captured by the gateway by the time this runs
 * (paymentController calls this AFTER Razorpay signature verification), so
 * this function can't reject the sale even if reserved_stock/stock_quantity
 * somehow can't cover it (that should be structurally impossible if
 * reserveStock ran correctly at checkout, but defends anyway rather than
 * throwing on a payment that has already been taken — same philosophy as
 * the pre-Phase-4 code's clamp-to-zero fallback). Returns `oversold: true`
 * when it had to clamp, so the caller can flag the order for manual review.
 */
const fulfillReservedSale = async (connection, { lockedProduct, quantity, orderId, createdBy }) => {
    const prevReserved = lockedProduct.reserved_stock;
    const prevStock = lockedProduct.stock_quantity;

    const releasedFromReservation = Math.min(quantity, prevReserved);
    const newReserved = prevReserved - releasedFromReservation;

    const oversold = quantity > prevStock;
    const newStock = oversold ? 0 : prevStock - quantity;

    await connection.query(
        'UPDATE products SET stock_quantity = ?, reserved_stock = ? WHERE id = ?',
        [newStock, newReserved, lockedProduct.id]
    );
    await logTransaction(connection, {
        productId: lockedProduct.id,
        transactionType: 'SALE',
        quantity: -quantity,
        referenceType: 'ORDER',
        referenceId: orderId,
        previousQuantity: prevStock,
        newQuantity: newStock,
        createdBy,
        notes: oversold
            ? `Oversold: reserved/available stock could not cover this paid order — clamped to 0, needs manual review.`
            : null
    });

    if (oversold) {
        logger.warn(
            { orderId, productId: lockedProduct.id, available: prevStock, requested: quantity },
            'Product oversold on a paid (reserved) order — stock clamped to 0, needs manual review'
        );
    }

    lockedProduct.stock_quantity = newStock;
    lockedProduct.reserved_stock = newReserved;
    return { previous: prevStock, next: newStock, oversold };
};

/**
 * SALE (direct, no prior reservation) — COD order path. COD orders skip the
 * reservation phase entirely (see orderController.createOrder): they go
 * straight from "available" to "sold" inside the same locked transaction
 * that created the order, since there's no separate payment-capture step to
 * wait for. Caller must have already validated availableStockOf(lockedProduct)
 * >= quantity (via wholesale.validateOrderQuantity) before calling this.
 */
const sellDirect = async (connection, { lockedProduct, quantity, orderId, createdBy }) => {
    const previous = lockedProduct.stock_quantity;
    const next = Math.max(0, previous - quantity); // defensive floor; caller's validation should make this a no-op

    await connection.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, lockedProduct.id]);
    await logTransaction(connection, {
        productId: lockedProduct.id,
        transactionType: 'SALE',
        quantity: -quantity,
        referenceType: 'ORDER',
        referenceId: orderId,
        previousQuantity: previous,
        newQuantity: next,
        createdBy
    });

    lockedProduct.stock_quantity = next;
    return { previous, next };
};

/**
 * RETURN — physical goods came back into the warehouse (order status moved
 * to 'Returned'). Restocks stock_quantity. Does NOT touch reserved_stock —
 * a returned order was already sold, its reservation (if it ever had one)
 * was already released/converted at sale time.
 */
const restockReturn = async (connection, { lockedProduct, quantity, orderId, createdBy, notes = null }) => {
    const previous = lockedProduct.stock_quantity;
    const next = previous + quantity;

    await connection.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, lockedProduct.id]);
    await logTransaction(connection, {
        productId: lockedProduct.id,
        transactionType: 'RETURN',
        quantity,
        referenceType: 'ORDER',
        referenceId: orderId,
        previousQuantity: previous,
        newQuantity: next,
        createdBy,
        notes
    });

    lockedProduct.stock_quantity = next;
    return { previous, next };
};

/**
 * REFUND — informational audit row for a refund that does NOT physically
 * restock (e.g. damaged/consumed goods, goodwill refund). Logs a zero-delta
 * transaction tied to the product/order so refunds still show up in a
 * product's inventory history even though no counter moves. When a refund
 * DOES come with goods back in the warehouse, use restockReturn (RETURN)
 * instead — the two are mutually exclusive per order item.
 */
const logRefundNoRestock = async (connection, { lockedProduct, orderId, createdBy, notes = null }) => {
    await logTransaction(connection, {
        productId: lockedProduct.id,
        transactionType: 'REFUND',
        quantity: 0,
        referenceType: 'ORDER',
        referenceId: orderId,
        previousQuantity: lockedProduct.stock_quantity,
        newQuantity: lockedProduct.stock_quantity,
        createdBy,
        notes
    });
};

/**
 * PURCHASE / ADJUSTMENT — admin stock intake or correction, always with a
 * reason. `delta` is signed: positive for intake/found-stock, negative for
 * damage/loss/recount-down. Rejects a delta that would push stock_quantity
 * below reserved_stock (would silently create negative available_stock —
 * chk_products_reserved_le_stock would also reject it at the DB layer, but
 * failing here first gives the admin a clear message instead of a raw SQL
 * constraint-violation error) or below zero outright.
 */
const adjustStock = async (connection, { lockedProduct, delta, transactionType, adminId, createdBy, reason }) => {
    if (!['PURCHASE', 'ADJUSTMENT'].includes(transactionType)) {
        throw new Error(`adjustStock: invalid transactionType "${transactionType}"`);
    }
    if (!Number.isInteger(delta) || delta === 0) {
        const err = new Error('Adjustment quantity must be a non-zero whole number.');
        err.code = 'INVALID_QUANTITY';
        throw err;
    }
    if (!reason || !String(reason).trim()) {
        const err = new Error('A reason is required for every stock adjustment.');
        err.code = 'REASON_REQUIRED';
        throw err;
    }

    const previous = lockedProduct.stock_quantity;
    const next = previous + delta;

    if (next < 0) {
        const err = new Error(`This adjustment would take stock below zero (currently ${previous}).`);
        err.code = 'NEGATIVE_STOCK';
        throw err;
    }
    if (next < lockedProduct.reserved_stock) {
        const err = new Error(
            `This adjustment would leave less stock (${next}) than is currently reserved (${lockedProduct.reserved_stock}) for pending orders.`
        );
        err.code = 'BELOW_RESERVED';
        throw err;
    }

    await connection.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, lockedProduct.id]);
    await logTransaction(connection, {
        productId: lockedProduct.id,
        transactionType,
        quantity: delta,
        referenceType: 'ADMIN',
        referenceId: adminId,
        previousQuantity: previous,
        newQuantity: next,
        createdBy,
        notes: reason
    });

    lockedProduct.stock_quantity = next;
    return { previous, next };
};

/**
 * Expiry sweep — releases reservations for online orders whose payment
 * window has lapsed. Two call sites:
 *   1. Inline/scoped: orderController.createOrder calls this for just the
 *      product ids in the current cart, right before locking+checking
 *      availability, so a customer's checkout can reclaim a stranger's
 *      abandoned reservation on the SAME product without waiting for the
 *      background sweep — and without ever being blocked by somebody
 *      else's abandoned reservation on an unrelated product.
 *   2. Background: a periodic full sweep (server.js, setInterval) with no
 *      productIds filter, as a safety net for reservations nobody ever
 *      comes back to re-trigger a checkout for.
 *
 * Runs its own dedicated transaction (never reuses a caller's), since it
 * legitimately needs to lock and mutate a set of orders/products the
 * caller's own transaction has no other business touching.
 */
const releaseExpiredReservations = async (pool, { productIds = null } = {}) => {
    const connection = await pool.getConnection();
    let releasedCount = 0;
    try {
        await connection.beginTransaction();

        const params = [];
        let productFilterSql = '';
        if (productIds && productIds.length > 0) {
            productFilterSql = 'AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.product_id IN (?))';
            params.push(productIds);
        }

        const [expiredOrders] = await connection.query(
            `SELECT o.id FROM orders o
             WHERE o.payment_method = 'online'
               AND o.order_status = 'Pending'
               AND o.payment_status = 'pending'
               AND o.reservation_expires_at IS NOT NULL
               AND o.reservation_expires_at < NOW()
               ${productFilterSql}
             ORDER BY o.id ASC
             FOR UPDATE`,
            params
        );

        for (const { id: orderId } of expiredOrders) {
            const [items] = await connection.query(
                'SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id ASC',
                [orderId]
            );
            const ids = items.map((i) => i.product_id);
            const lockedById = await lockProductsForUpdate(connection, ids);

            for (const item of items) {
                const lockedProduct = lockedById.get(item.product_id);
                if (!lockedProduct) continue; // product hard-deleted (shouldn't happen — RESTRICT FK) — skip defensively
                await releaseReservation(connection, {
                    lockedProduct,
                    quantity: item.quantity,
                    orderId,
                    createdBy: 'System',
                    notes: 'Reservation expired — payment not completed in time.'
                });
            }

            await connection.query(
                `UPDATE orders SET order_status = 'Cancelled', payment_status = 'failed' WHERE id = ?`,
                [orderId]
            );
            await connection.query(
                `INSERT INTO order_status_history (order_id, old_status, status, comment, created_by)
                 VALUES (?, 'Pending', 'Cancelled', 'Reservation expired — payment window closed without a completed payment.', 'System')`,
                [orderId]
            );
            releasedCount += 1;
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        logger.error({ err: error }, 'releaseExpiredReservations failed');
        throw error;
    } finally {
        connection.release();
    }
    return releasedCount;
};

module.exports = {
    RESERVATION_TTL_MINUTES,
    availableStockOf,
    lockProductsForUpdate,
    logTransaction,
    reserveStock,
    releaseReservation,
    fulfillReservedSale,
    sellDirect,
    restockReturn,
    logRefundNoRestock,
    adjustStock,
    releaseExpiredReservations
};
