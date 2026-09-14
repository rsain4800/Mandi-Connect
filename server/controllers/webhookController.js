/**
 * webhookController.js — Phase 5. The backend/webhook is the source of
 * truth for payment state (Step 4); this is that webhook.
 *
 * Mounted directly in server.js (NOT through routes/paymentRoutes.js,
 * which requires a logged-in user via verifyToken — Razorpay's servers
 * have no session/cookie/JWT and must never be asked for one) with
 * `express.raw()` ahead of the global `express.json()` parser, so
 * `req.body` here is the exact raw Buffer Razorpay sent — required for
 * signature verification (see utils/verifyWebhookSignature.js).
 *
 * Every event is processed inside one DB transaction that starts with an
 * INSERT into `webhook_events` keyed on Razorpay's X-Razorpay-Event-Id
 * header. That INSERT is what makes "the same webhook arrives twice" safe
 * (Step 3) — a duplicate delivery hits the unique index and the handler
 * returns 200 without running any business logic a second time, and it
 * does so atomically with everything the event goes on to change (an
 * event is never marked "seen" unless its side effects also committed).
 */

const { pool } = require('../config/db');
const logger = require('../utils/logger');
const { verifyRazorpayWebhookSignature } = require('../utils/verifyWebhookSignature');
const paymentFulfillment = require('../services/paymentFulfillmentService');
const refundService = require('../services/refundService');

// Best-effort id extraction for the `entity_id` observability column only
// — never used for security/dedupe decisions (event_id is).
const extractEntityId = (payload) => {
    const p = payload.payload || {};
    return p.payment?.entity?.id || p.refund?.entity?.id || p.order?.entity?.id || null;
};

/**
 * Looks up the order + payment row a payment-related webhook event refers
 * to, via the Razorpay order id embedded in the payment entity. Returns
 * null if we have no matching order — logged, not thrown, since a webhook
 * for an order that doesn't exist in our DB (wrong account, stale test
 * data, webhook misconfigured to point at the wrong environment) should
 * not be retried forever by returning a 5xx.
 */
const loadOrderAndPaymentForPayment = async (connection, razorpayOrderId) => {
    const [payments] = await connection.query(
        'SELECT * FROM payments WHERE razorpay_order_id = ?',
        [razorpayOrderId]
    );
    if (payments.length === 0) return { order: null, payment: null };
    const payment = payments[0];

    const [orders] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [payment.order_id]);
    if (orders.length === 0) return { order: null, payment };

    return { order: orders[0], payment };
};

const handlePaymentAuthorized = async (connection, payload) => {
    const entity = payload.payload.payment.entity;
    // Auto-capture is the default for orders created via
    // utils/razorpay.js (no payment_capture: 0 override), so `captured`
    // normally follows within moments and does the real fulfillment work.
    // This event is kept informational/defensive: if a captured event is
    // ever missed or delayed, at least the payment row reflects
    // 'authorized' rather than sitting stuck at 'created'.
    await connection.query(
        `UPDATE payments SET status = 'authorized' WHERE razorpay_order_id = ? AND status = 'created'`,
        [entity.order_id]
    );
};

const handlePaymentCaptured = async (connection, payload) => {
    const entity = payload.payload.payment.entity;
    const { order, payment } = await loadOrderAndPaymentForPayment(connection, entity.order_id);
    if (!order) {
        logger.warn({ razorpayOrderId: entity.order_id, razorpayPaymentId: entity.id }, 'payment.captured webhook for an unknown order — ignoring');
        return;
    }
    const result = await paymentFulfillment.fulfillCapturedPayment(connection, {
        order,
        razorpayOrderId: entity.order_id,
        razorpayPaymentId: entity.id,
        paymentMethod: entity.method || null,
        source: 'webhook',
        createdBy: 'Razorpay Webhook'
    });

    if (!result.alreadyProcessed) {
        const { sendAdminNewOrderEmail, sendCustomerOrderEmail } = require('../utils/emailService');
        const [[user]] = await connection.query('SELECT full_name, email, phone FROM users WHERE id = ?', [order.user_id]);
        // Fire-and-forget, same as every other call site in this codebase
        // — never let a slow/failing email provider affect the webhook's
        // response time (Razorpay expects a response within 5 seconds).
        sendAdminNewOrderEmail(result.order, result.orderItems, user);
        sendCustomerOrderEmail(result.order, result.orderItems, user);
    }
};

const handlePaymentFailed = async (connection, payload) => {
    const entity = payload.payload.payment.entity;
    const { order } = await loadOrderAndPaymentForPayment(connection, entity.order_id);
    if (!order) {
        logger.warn({ razorpayOrderId: entity.order_id }, 'payment.failed webhook for an unknown order — ignoring');
        return;
    }
    await paymentFulfillment.markPaymentFailed(connection, {
        order,
        razorpayOrderId: entity.order_id,
        reason: `Payment failed at Razorpay (${entity.error_code || 'unknown error'}).`,
        errorCode: entity.error_code || null,
        errorDescription: entity.error_description || null,
        createdBy: 'Razorpay Webhook'
    });
};

const loadOrderAndPaymentForRefund = async (connection, refundEntity) => {
    const [payments] = await connection.query('SELECT * FROM payments WHERE razorpay_payment_id = ?', [refundEntity.payment_id]);
    if (payments.length === 0) return { order: null, payment: null };
    const payment = payments[0];
    const [orders] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [payment.order_id]);
    if (orders.length === 0) return { order: null, payment };
    return { order: orders[0], payment };
};

const handleRefundProcessed = async (connection, payload) => {
    const refundEntity = payload.payload.refund.entity;
    const { order, payment } = await loadOrderAndPaymentForRefund(connection, refundEntity);
    if (!order) {
        logger.warn({ razorpayPaymentId: refundEntity.payment_id }, 'refund.processed webhook for an unknown payment — ignoring');
        return;
    }
    await refundService.finalizeRefund(connection, { refundEntity, order, payment, createdBy: 'Razorpay Webhook' });
};

const handleRefundFailed = async (connection, payload) => {
    const refundEntity = payload.payload.refund.entity;
    await refundService.markRefundFailed(connection, { refundEntity });
};

// order.paid intentionally has no handler: it always fires alongside
// payment.captured for the same payment (per Razorpay's own docs), and
// fulfillCapturedPayment is already idempotent on the order row — so
// processing order.paid too would be redundant work, not incorrect, but
// there's no reason to pay for a second row lock + no-op every time.
const EVENT_HANDLERS = {
    'payment.authorized': handlePaymentAuthorized,
    'payment.captured': handlePaymentCaptured,
    'payment.failed': handlePaymentFailed,
    'refund.processed': handleRefundProcessed,
    'refund.failed': handleRefundFailed
};

const handleRazorpayWebhook = async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const eventId = req.headers['x-razorpay-event-id'];
    const rawBody = req.body; // Buffer — see express.raw() mount in server.js

    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
        logger.error('RAZORPAY_WEBHOOK_SECRET is not configured — rejecting webhook delivery.');
        return res.status(500).json({ success: false, message: 'Webhook not configured.' });
    }

    if (!signature || !verifyRazorpayWebhookSignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) {
        logger.warn('Razorpay webhook signature verification failed — rejecting.');
        return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
    }

    // Razorpay always sends this on genuine deliveries; without it we
    // cannot dedupe safely, so refuse rather than risk double-processing.
    if (!eventId) {
        logger.warn('Razorpay webhook missing X-Razorpay-Event-Id header — rejecting.');
        return res.status(400).json({ success: false, message: 'Missing event id.' });
    }

    let payload;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
        return res.status(400).json({ success: false, message: 'Invalid JSON payload.' });
    }

    const eventType = payload.event;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        let isDuplicate = false;
        try {
            await connection.query(
                'INSERT INTO webhook_events (event_id, event_type, entity_id, payload) VALUES (?, ?, ?, ?)',
                [eventId, eventType, extractEntityId(payload), rawBody.toString('utf8')]
            );
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                isDuplicate = true;
            } else {
                throw err;
            }
        }

        if (isDuplicate) {
            await connection.commit();
            connection.release();
            logger.info({ eventId, eventType }, 'Duplicate Razorpay webhook delivery ignored');
            return res.status(200).json({ success: true, message: 'Already processed.' });
        }

        const handler = EVENT_HANDLERS[eventType];
        if (handler) {
            await handler(connection, payload);
        } else {
            logger.info({ eventType }, 'Received Razorpay webhook event with no handler — recorded, not acted on');
        }

        await connection.query('UPDATE webhook_events SET processed_at = NOW() WHERE event_id = ?', [eventId]);

        await connection.commit();
        connection.release();
        return res.status(200).json({ success: true });
    } catch (error) {
        await connection.rollback();
        connection.release();
        logger.error({ err: error, eventId, eventType }, 'Error processing Razorpay webhook');
        // 500 tells Razorpay to retry (exponential backoff, up to 24h).
        // Safe to retry: the whole handler ran in one transaction, so the
        // webhook_events insert itself was rolled back too — the retry
        // will not be mistaken for a duplicate.
        return res.status(500).json({ success: false, message: 'Error processing webhook.' });
    }
};

module.exports = { handleRazorpayWebhook };