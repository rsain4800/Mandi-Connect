/**
 * refundService.js — Phase 5 Step 7.
 *
 * Core rule this file exists to enforce: an admin clicking "Refund" in the
 * dashboard only ever *requests* a refund from Razorpay. It never, by
 * itself, marks an order/payment as refunded or moves any stock. Only a
 * verified `refund.processed` webhook (see controllers/webhookController.js)
 * does that — see finalizeRefund below. `refund.failed` is handled the
 * same way in reverse: it marks the refund attempt failed so the admin can
 * see the money was NOT actually returned to the customer and can decide
 * whether to retry.
 *
 * Two entry points:
 *   - initiateRefund: called from controllers/refundController.js inside a
 *     short transaction that only creates the local `refunds` row and
 *     validates amounts — the actual Razorpay API call happens OUTSIDE
 *     any open transaction (same "never hold a DB row lock across an
 *     external HTTP call" rule this codebase already follows for email —
 *     see paymentController/orderController sending emails only after
 *     commit).
 *   - finalizeRefund / markRefundFailed: called from the webhook handler
 *     to reconcile a `refunds` row (or create one on the fly if the
 *     refund was never initiated through our own admin endpoint — e.g. a
 *     refund created directly from the Razorpay dashboard) against the
 *     gateway's own authoritative result.
 */

const logger = require('../utils/logger');
const { razorpayClient } = require('../utils/razorpay');
const inventoryService = require('./inventoryService');

/**
 * Step 1 of a refund: validate and record the *request* locally. Does NOT
 * call Razorpay — see initiateRefund below for the full flow. Split out so
 * the DB transaction that creates this row can commit and release its
 * locks before the network call happens.
 */
const createPendingRefundRecord = async (connection, { order, payment, amount, reason, restock, idempotencyKey, initiatedBy }) => {
    const [result] = await connection.query(
        `INSERT INTO refunds (order_id, payment_id, amount, restock, status, notes, initiated_by, idempotency_key)
         VALUES (?, ?, ?, ?, 'created', ?, ?, ?)`,
        [order.id, payment.id, amount, restock ? 1 : 0, reason || null, initiatedBy, idempotencyKey || null]
    );
    return result.insertId;
};

/**
 * Step 2: actually call Razorpay, outside any DB transaction. Always
 * updates the local refund row afterwards — with the gateway result on
 * success, or with status='failed' if the call itself errors (network
 * failure, Razorpay rejecting the request, etc). Never touches
 * orders/payments — that only ever happens in finalizeRefund, driven by
 * the webhook, per this file's header comment.
 *
 * If the API call throws AFTER Razorpay actually created the refund
 * (e.g. we got a timeout but the refund went through), the eventual
 * `refund.processed` webhook will still arrive and finalizeRefund's
 * fallback path (matching by payment + amount when no razorpay_refund_id
 * is on file yet) reconciles it — see finalizeRefund below.
 */
const submitRefundToRazorpay = async (connection, refundId, { payment, amountPaise, reason, orderNumber }) => {
    try {
        const response = await razorpayClient.payments.refund(payment.razorpay_payment_id, {
            amount: amountPaise,
            notes: { reason: reason || 'Admin-initiated refund', order_number: orderNumber },
            receipt: `refund_${refundId}`
        });

        // response.status is typically 'processed' (instant refund methods)
        // or 'pending' (bank-dependent refunds that settle over days). We
        // record it for visibility, but it is NOT what marks the order
        // refunded — only the webhook does that. This avoids a dual-write
        // race between "the synchronous API response said X" and "the
        // webhook said Y" ever disagreeing about who updates the order.
        await connection.query(
            `UPDATE refunds SET razorpay_refund_id = ?, status = 'processing' WHERE id = ?`,
            [response.id, refundId]
        );
        return { success: true, razorpayRefundId: response.id };
    } catch (error) {
        logger.error({ err: error, refundId }, 'Razorpay refund API call failed');
        await connection.query(
            `UPDATE refunds SET status = 'failed', notes = CONCAT(COALESCE(notes, ''), ?) WHERE id = ?`,
            [`\n[API error] ${error.error?.description || error.message || 'Unknown error'}`, refundId]
        );
        const err = new Error('Razorpay rejected the refund request.');
        err.publicMessage = error.error?.description || 'Unable to initiate refund with the payment gateway.';
        err.status = 502;
        throw err;
    }
};

/**
 * Full admin-initiated refund flow. Called from refundController with its
 * own freshly-created connection/transaction for step 1; performs step 2
 * (the network call) using a second, short-lived connection so no lock is
 * held during the HTTP round trip.
 */
const initiateRefund = async (pool, { order, payment, amount, reason, restock, idempotencyKey, initiatedBy }) => {
    const amountPaise = Math.round(amount * 100);

    const conn1 = await pool.getConnection();
    let refundId;
    try {
        await conn1.beginTransaction();
        refundId = await createPendingRefundRecord(conn1, { order, payment, amount, reason, restock, idempotencyKey, initiatedBy });
        await conn1.commit();
    } catch (error) {
        await conn1.rollback();
        throw error;
    } finally {
        conn1.release();
    }

    const conn2 = await pool.getConnection();
    try {
        const result = await submitRefundToRazorpay(conn2, refundId, {
            payment, amountPaise, reason, orderNumber: order.order_number
        });
        return { refundId, ...result };
    } finally {
        conn2.release();
    }
};

/**
 * Locates the refunds row this webhook event is about. Falls back to
 * creating one on the fly (matched by the payment's razorpay_payment_id)
 * for a refund that was never created through our own admin endpoint —
 * e.g. issued directly from the Razorpay dashboard, or one whose
 * `submitRefundToRazorpay` update above never landed (server crash
 * between the API call succeeding and the local UPDATE committing).
 * Locks the row (or the parent order, for the insert-on-the-fly case) so
 * concurrent webhook deliveries for the same refund serialize correctly.
 */
const findOrCreateRefundRow = async (connection, { refundEntity, order, payment }) => {
    const [existing] = await connection.query(
        'SELECT * FROM refunds WHERE razorpay_refund_id = ? FOR UPDATE',
        [refundEntity.id]
    );
    if (existing.length > 0) return existing[0];

    const [byPending] = await connection.query(
        `SELECT * FROM refunds WHERE payment_id = ? AND razorpay_refund_id IS NULL AND status IN ('created','processing')
         ORDER BY id ASC LIMIT 1 FOR UPDATE`,
        [payment.id]
    );
    if (byPending.length > 0) {
        await connection.query('UPDATE refunds SET razorpay_refund_id = ? WHERE id = ?', [refundEntity.id, byPending[0].id]);
        return { ...byPending[0], razorpay_refund_id: refundEntity.id };
    }

    // Genuinely unknown refund (created outside our own admin flow) —
    // record it so it still shows up in this order's refund history and
    // still moves amount_refunded/order state correctly below.
    const [insertResult] = await connection.query(
        `INSERT INTO refunds (order_id, payment_id, razorpay_refund_id, amount, restock, status, notes, initiated_by)
         VALUES (?, ?, ?, ?, 0, 'processing', 'Reconciled from webhook — not initiated via this app.', 'Razorpay Dashboard')`,
        [order.id, payment.id, refundEntity.id, refundEntity.amount / 100]
    );
    return {
        id: insertResult.insertId,
        order_id: order.id,
        payment_id: payment.id,
        razorpay_refund_id: refundEntity.id,
        amount: refundEntity.amount / 100,
        restock: 0,
        status: 'processing'
    };
};

/**
 * `refund.processed` — the only event allowed to mark money as actually
 * returned to the customer. Idempotent: a duplicate delivery for a refund
 * already marked 'processed' is a no-op (checked under the same row lock
 * findOrCreateRefundRow just took).
 */
const finalizeRefund = async (connection, { refundEntity, order, payment, createdBy }) => {
    const refundRow = await findOrCreateRefundRow(connection, { refundEntity, order, payment });

    if (refundRow.status === 'processed') {
        return { alreadyProcessed: true };
    }

    const refundAmount = refundEntity.amount / 100;

    await connection.query('UPDATE refunds SET status = \'processed\' WHERE id = ?', [refundRow.id]);

    const newAmountRefunded = Math.min(
        parseFloat(payment.amount),
        parseFloat(payment.amount_refunded || 0) + refundAmount
    );
    const isFullyRefunded = newAmountRefunded >= parseFloat(payment.amount) - 0.005;

    await connection.query(
        `UPDATE payments SET amount_refunded = ?, status = ? WHERE id = ?`,
        [newAmountRefunded, isFullyRefunded ? 'refunded' : 'partially_refunded', payment.id]
    );

    const newOrderPaymentStatus = isFullyRefunded ? 'refunded' : 'partially_refunded';
    await connection.query(
        `UPDATE orders SET payment_status = ?, order_status = ? WHERE id = ?`,
        [newOrderPaymentStatus, isFullyRefunded ? 'Refunded' : order.order_status, order.id]
    );

    // Inventory effect — only for a genuinely NEW refund row transitioning
    // to 'processed' for the first time (guarded above), exactly once per
    // refund, matching the RETURN-vs-REFUND distinction already used by
    // orderController.updateOrderStatus for manual refunds.
    const [items] = await connection.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id ASC',
        [order.id]
    );
    const lockedById = await inventoryService.lockProductsForUpdate(connection, items.map((i) => i.product_id));
    for (const item of items) {
        const lockedProduct = lockedById.get(item.product_id);
        if (!lockedProduct) continue;
        if (refundRow.restock) {
            await inventoryService.restockReturn(connection, {
                lockedProduct,
                quantity: item.quantity,
                orderId: order.id,
                createdBy,
                notes: `Refund ${refundRow.razorpay_refund_id || refundEntity.id} processed — goods returned, restocked.`
            });
        } else {
            await inventoryService.logRefundNoRestock(connection, {
                lockedProduct,
                orderId: order.id,
                createdBy,
                notes: `Refund ${refundRow.razorpay_refund_id || refundEntity.id} processed for ₹${refundAmount} — no physical return.`
            });
        }
    }

    await connection.query(
        `INSERT INTO order_status_history (order_id, old_status, status, comment, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [
            order.id,
            order.order_status,
            isFullyRefunded ? 'Refunded' : order.order_status,
            `Refund of ₹${refundAmount} confirmed processed by Razorpay${isFullyRefunded ? ' (full refund)' : ' (partial refund)'}.`,
            createdBy
        ]
    );

    return { alreadyProcessed: false, isFullyRefunded };
};

/**
 * `refund.failed` — the refund attempt did NOT return money to the
 * customer. Marks the local row so it stops showing as pending/processing
 * and an admin can see it needs manual attention (retry, or investigate
 * via the Razorpay dashboard). Deliberately does not touch
 * orders/payments — nothing about the order's paid state has changed.
 */
const markRefundFailed = async (connection, { refundEntity }) => {
    const [existing] = await connection.query(
        'SELECT * FROM refunds WHERE razorpay_refund_id = ? FOR UPDATE',
        [refundEntity.id]
    );
    if (existing.length === 0) {
        logger.warn({ razorpayRefundId: refundEntity.id }, 'refund.failed webhook for a refund we have no local record of');
        return;
    }
    if (existing[0].status === 'failed') return; // already recorded

    await connection.query(
        `UPDATE refunds SET status = 'failed', notes = CONCAT(COALESCE(notes, ''), ?) WHERE id = ?`,
        ['\n[Razorpay] Refund failed — requires manual review.', existing[0].id]
    );
    logger.warn({ razorpayRefundId: refundEntity.id, orderId: existing[0].order_id }, 'Refund failed at Razorpay — needs manual follow-up');
};

module.exports = {
    initiateRefund,
    finalizeRefund,
    markRefundFailed
};