const { razorpayClient } = require('../utils/razorpay');
const { pool } = require('../config/db');
const { sendAdminNewOrderEmail, sendCustomerOrderEmail } = require('../utils/emailService');
const { verifyRazorpaySignature } = require('../utils/verifySignature');
const logger = require('../utils/logger');
const paymentFulfillment = require('../services/paymentFulfillmentService');

// Create Razorpay Order
const createRazorpayOrder = async (req, res) => {
    try {
        const { order_id } = req.body;

        const [orders] = await pool.query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [order_id, req.user.id]);
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const order = orders[0];

        // Refuse to open a payment window on an order whose reservation has
        // already lapsed (or been cancelled) — the background/inline sweep
        // (inventoryService.releaseExpiredReservations) may have already
        // released this order's held stock back to general availability by
        // the time the customer gets to the Razorpay button, so starting a
        // payment here could collect money for stock that's no longer held.
        if (order.order_status === 'Cancelled') {
            return res.status(410).json({
                success: false,
                message: 'This order was cancelled because its stock reservation expired. Please place a new order.',
                code: 'RESERVATION_EXPIRED'
            });
        }
        if (order.payment_status === 'paid') {
            return res.status(409).json({ success: false, message: 'This order has already been paid.', code: 'ALREADY_PAID' });
        }

        const amountInPaisa = Math.round(parseFloat(order.total_amount) * 100);

        const options = {
            amount: amountInPaisa,
            currency: 'INR',
            receipt: `rcpt_${order.order_number}`,
            notes: {
                order_id: order.id,
                order_number: order.order_number,
                user_id: req.user.id
            }
        };

        const razorpayOrder = await razorpayClient.orders.create(options);

        // Store payment log
        await pool.query(
            'INSERT INTO payments (order_id, razorpay_order_id, amount, status) VALUES (?, ?, ?, "created")',
            [order.id, razorpayOrder.id, order.total_amount]
        );

        return res.json({
            success: true,
            razorpayOrder,
            key: process.env.RAZORPAY_KEY_ID,
            amount: amountInPaisa,
            currency: 'INR',
            order_number: order.order_number
        });
    } catch (error) {
        logger.error({ err: error }, 'Create Razorpay order error');
        return res.status(500).json({ success: false, message: 'Online payment is unavailable. Verify the Razorpay API credentials and try again.' });
    }
};

// Verify Razorpay Payment Signature on Backend
//
// IMPORTANT — Phase 5: this endpoint is a SUPPORTING mechanism only (Step
// 4), not the source of truth. It exists purely so a customer whose
// browser is still open sees "Order confirmed" instantly instead of
// waiting for the webhook round trip. The actual source of truth is
// controllers/webhookController.js's payment.captured handler, which
// calls the exact same paymentFulfillment.fulfillCapturedPayment used
// below — so no matter which of the two arrives first, the order is
// fulfilled exactly once, and if this endpoint is never called at all
// (browser crash right after payment, network drops before the callback
// fires, user closes the tab) the webhook still confirms the order on its
// own. Never make this endpoint do anything the webhook path can't also
// do by itself.
const verifyPayment = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Missing payment verification details.' });
        }

        // This signature check is the only integrity guarantee available
        // on this (untrusted, browser-originated) path — it proves the
        // caller actually saw a genuine Razorpay checkout success for this
        // exact order_id + payment_id pair, signed with our API secret.
        // It is still not treated as sufficient on its own to confirm the
        // order: fulfillCapturedPayment below performs the exact same
        // fulfillment the webhook performs, so this callback can never
        // diverge from what the webhook would eventually do anyway — it
        // just does it sooner when it's available.
        if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, process.env.RAZORPAY_KEY_SECRET)) {
            const [[failedOrder]] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [order_id]);
            if (failedOrder) {
                await paymentFulfillment.markPaymentFailed(connection, {
                    order: failedOrder,
                    razorpayOrderId: razorpay_order_id,
                    reason: 'Payment signature verification failed on frontend callback.',
                    createdBy: 'Razorpay System (frontend verify)'
                });
            }
            await connection.commit();
            connection.release();
            return res.status(400).json({ success: false, message: 'Payment verification signature failed.' });
        }

        // Lock the order row before doing anything else — this is what
        // makes this call safe to race against the webhook (or against
        // itself, e.g. a double-tapped "Pay" retry): both serialize here,
        // and fulfillCapturedPayment itself is idempotent on payment_status.
        const [orders] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [order_id]);
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        const order = orders[0];

        const result = await paymentFulfillment.fulfillCapturedPayment(connection, {
            order,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            source: 'frontend_verify',
            createdBy: 'Razorpay System (frontend verify)'
        });

        await connection.commit();
        connection.release();

        if (result.alreadyProcessed) {
            return res.json({
                success: true,
                message: 'Payment already verified for this order.',
                order_id: order.id,
                order_number: order.order_number
            });
        }

        // Dispatch Email Alerts (after commit — never let a slow/failing
        // email provider hold the DB transaction open)
        sendAdminNewOrderEmail(result.order, result.orderItems, req.user);
        sendCustomerOrderEmail(result.order, result.orderItems, req.user);

        return res.json({
            success: true,
            message: 'Payment verified successfully! Order confirmed.',
            order_id: order.id,
            order_number: order.order_number
        });

    } catch (error) {
        await connection.rollback();
        connection.release();
        logger.error({ err: error }, 'Verify payment error');
        return res.status(500).json({ success: false, message: 'Error verifying payment.' });
    }
};

module.exports = {
    createRazorpayOrder,
    verifyPayment
};