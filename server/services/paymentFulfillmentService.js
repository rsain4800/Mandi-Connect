/**
 * paymentFulfillmentService.js — the single place that turns a "payment is
 * actually captured/failed" fact into database side-effects (order status,
 * payment row, inventory). Phase 5.
 *
 * Both controllers/webhookController.js (the source of truth) and
 * controllers/paymentController.js's verifyPayment (a supporting,
 * best-effort UX shortcut — see its own comments) call into this module
 * rather than duplicating the fulfillment logic, so there is exactly ONE
 * implementation of "what does a captured payment do to an order" no
 * matter which of the two ever gets there first. Whichever call wins the
 * row lock on `orders` does the real work; the other observes
 * payment_status already settled and returns a no-op success. This is
 * what makes it safe for the webhook and the frontend callback to race
 * each other (frontend crash after payment, server restart after payment,
 * duplicate webhook delivery, etc — see Phase 5 Step 9's test list).
 *
 * Every function here takes an already-open `connection`
 * (pool.getConnection() + beginTransaction() done by the caller) and never
 * commits/rolls back itself, same convention as the rest of this codebase.
 */

const logger = require('../utils/logger');
const inventoryService = require('../services/inventoryService');
const invoiceService = require('../services/invoiceService');

/**
 * A payment gateway has confirmed capture (webhook `payment.captured`, or
 * — as a supporting fallback — a signature-verified frontend callback).
 * Idempotent: safe to call twice for the same order (second call is a
 * no-op success) and safe to call concurrently with itself (serializes on
 * the `orders` row lock the caller must already hold).
 *
 * @param {object} connection - open, already-in-transaction DB connection
 * @param {object} params
 * @param {object} params.order - the already-`SELECT ... FOR UPDATE`-locked order row
 * @param {string} params.razorpayOrderId
 * @param {string} params.razorpayPaymentId
 * @param {string} [params.razorpaySignature] - only present on the frontend-verify path
 * @param {string} [params.paymentMethod] - e.g. 'upi', 'card' (from the webhook payload)
 * @param {string} params.source - 'webhook' | 'frontend_verify', for audit trail/logs only
 * @param {string} params.createdBy - actor label for order_status_history / inventory_transactions
 * @returns {{ alreadyProcessed: boolean, order: object, orderItems: Array, anyOversold: boolean }}
 */
const fulfillCapturedPayment = async (connection, {
    order,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature = null,
    paymentMethod = null,
    source,
    createdBy
}) => {
    // Idempotency: if this order is already marked paid, this call — no
    // matter whether it's the webhook or the frontend callback, and no
    // matter how many times it fires — must be a no-op. Whichever call
    // got here first already did the real work under this same row lock.
    if (order.payment_status === 'paid') {
        return { alreadyProcessed: true, order, orderItems: [], anyOversold: false };
    }

    // A payment can only ever be captured for an order that hasn't already
    // been refunded/cancelled out from under it. This should be
    // structurally rare (it would mean Razorpay captured money for an
    // order we ourselves already gave up on, e.g. after the reservation
    // expired) but is defended rather than silently overwritten.
    if (['refunded', 'partially_refunded'].includes(order.payment_status)) {
        logger.warn(
            { orderId: order.id, razorpayPaymentId, source },
            'Received a captured-payment confirmation for an order already in a refunded state — flagging for manual review, not re-confirming.'
        );
        return { alreadyProcessed: true, order, orderItems: [], anyOversold: false, conflict: true };
    }

    await connection.query(
        `UPDATE payments
         SET razorpay_payment_id = ?,
             razorpay_signature = COALESCE(?, razorpay_signature),
             payment_method = COALESCE(?, payment_method),
             status = 'captured',
             captured_at = NOW()
         WHERE razorpay_order_id = ?`,
        [razorpayPaymentId, razorpaySignature, paymentMethod, razorpayOrderId]
    );

    // Clears reservation_expires_at — a paid order's stock is sold, not
    // reserved, so it must never be swept by releaseExpiredReservations.
    await connection.query(
        `UPDATE orders
         SET payment_status = 'paid', order_status = 'Confirmed', reservation_expires_at = NULL
         WHERE id = ?`,
        [order.id]
    );

    // Phase 8: update the invoice's payment_status to 'paid' when payment
    // is captured. The invoice was created at order creation time with
    // payment_status='pending' — this is the moment it becomes final.
    await connection.query(
        `UPDATE invoices SET payment_status = 'paid', payment_method = COALESCE(?, payment_method) WHERE order_id = ?`,
        [paymentMethod, order.id]
    ).catch((err) => {
        // Non-fatal: if the invoice doesn't exist yet (race condition) or
        // the table doesn't exist (pre-migration), log and continue.
        logger.warn({ err, orderId: order.id }, 'Could not update invoice payment status — invoice may not exist yet.');
    });

    // Convert the reservation into an actual sale.
    const [orderItems] = await connection.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id ASC',
        [order.id]
    );
    const lockedProductById = await inventoryService.lockProductsForUpdate(connection, orderItems.map((i) => i.product_id));

    let anyOversold = false;
    for (const item of orderItems) {
        const lockedProduct = lockedProductById.get(item.product_id);
        if (!lockedProduct) {
            logger.warn({ orderId: order.id, productId: item.product_id }, 'Order item references a product that no longer exists');
            continue;
        }
        const { oversold } = await inventoryService.fulfillReservedSale(connection, {
            lockedProduct,
            quantity: item.quantity,
            orderId: order.id,
            createdBy
        });
        if (oversold) anyOversold = true;
    }

    await connection.query(
        `INSERT INTO order_status_history (order_id, old_status, status, comment, created_by) VALUES (?, ?, 'Confirmed', ?, ?)`,
        [order.id, order.order_status, anyOversold
            ? `Payment captured via Razorpay (${source}) — WARNING: stock could not fully cover this order, flagged for manual review.`
            : `Payment captured via Razorpay (${source}).`, createdBy]
    );

    return {
        alreadyProcessed: false,
        order: { ...order, payment_status: 'paid', order_status: 'Confirmed' },
        orderItems,
        anyOversold
    };
};

/**
 * A payment attempt has definitively failed (webhook `payment.failed`, or
 * — as a supporting fallback — a frontend callback whose signature failed
 * to verify). Releases the stock reservation immediately rather than
 * leaving it locked for the customer to retry or for the expiry sweep to
 * eventually clean up. Idempotent: a second call for an already
 * cancelled/failed order is a no-op.
 *
 * @param {object} connection
 * @param {object} params
 * @param {object} params.order - the already-locked order row
 * @param {string} params.razorpayOrderId
 * @param {string} params.reason - human-readable, goes into order_status_history
 * @param {string} [params.errorCode] - Razorpay error code, non-sensitive
 * @param {string} [params.errorDescription] - Razorpay error description, non-sensitive
 * @param {string} params.createdBy
 */
const markPaymentFailed = async (connection, {
    order,
    razorpayOrderId,
    reason,
    errorCode = null,
    errorDescription = null,
    createdBy
}) => {
    if (order.payment_status === 'paid' || order.order_status === 'Cancelled') {
        // Already settled one way or the other — a late/duplicate
        // payment.failed for an order that either already succeeded
        // (authorized-then-captured race) or was already cancelled is a
        // no-op, never a downgrade.
        return { alreadyProcessed: true };
    }

    await connection.query(
        `UPDATE payments
         SET status = 'failed', error_code = ?, error_description = ?
         WHERE razorpay_order_id = ?`,
        [errorCode, errorDescription, razorpayOrderId]
    );

    const [items] = await connection.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id ASC',
        [order.id]
    );
    const lockedById = await inventoryService.lockProductsForUpdate(connection, items.map((i) => i.product_id));
    for (const item of items) {
        const lockedProduct = lockedById.get(item.product_id);
        if (!lockedProduct) continue;
        await inventoryService.releaseReservation(connection, {
            lockedProduct,
            quantity: item.quantity,
            orderId: order.id,
            createdBy,
            notes: reason
        });
    }

    await connection.query(
        `UPDATE orders SET payment_status = 'failed', order_status = 'Cancelled' WHERE id = ?`,
        [order.id]
    );

    // Phase 8: mark invoice as failed when payment fails
    await connection.query(
        `UPDATE invoices SET payment_status = 'failed' WHERE order_id = ?`,
        [order.id]
    ).catch((err) => {
        logger.warn({ err, orderId: order.id }, 'Could not update invoice payment status on failure.');
    });
    await connection.query(
        `INSERT INTO order_status_history (order_id, old_status, status, comment, created_by)
         VALUES (?, ?, 'Cancelled', ?, ?)`,
        [order.id, order.order_status, reason, createdBy]
    );

    return { alreadyProcessed: false };
};

module.exports = {
    fulfillCapturedPayment,
    markPaymentFailed
};