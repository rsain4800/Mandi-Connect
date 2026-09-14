const { pool } = require('../config/db');
const logger = require('../utils/logger');
const refundService = require('../services/refundService');

// Admin: initiate a refund for a paid/partially-refunded order.
//
// This endpoint ONLY requests a refund from Razorpay — it never sets
// order.payment_status = 'refunded' itself (Phase 5 Step 7). The order
// moves to 'refunded'/'partially_refunded' only once
// controllers/webhookController.js receives and verifies a
// `refund.processed` event. See services/refundService.js's header
// comment for the full reasoning.
const initiateRefund = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const orderId = req.params.id;
        const { amount, reason, restock = false, idempotency_key: idempotencyKey } = req.body;

        const [orders] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        const order = orders[0];

        if (!['paid', 'partially_refunded'].includes(order.payment_status)) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: `Cannot refund an order with payment status "${order.payment_status}".`
            });
        }

        const [payments] = await connection.query(
            `SELECT * FROM payments WHERE order_id = ? AND status IN ('captured', 'partially_refunded', 'refunded')
             ORDER BY id DESC LIMIT 1`,
            [orderId]
        );
        if (payments.length === 0 || !payments[0].razorpay_payment_id) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'No captured payment found for this order.' });
        }
        const payment = payments[0];

        // Idempotency: a repeated request carrying the same idempotency_key
        // (e.g. an admin double-clicking "Refund", or a retried request
        // after a flaky connection) returns the existing attempt instead of
        // calling Razorpay a second time.
        if (idempotencyKey) {
            const [existing] = await connection.query('SELECT * FROM refunds WHERE idempotency_key = ?', [idempotencyKey]);
            if (existing.length > 0) {
                await connection.commit();
                connection.release();
                return res.json({ success: true, message: 'This refund was already requested.', refund: existing[0] });
            }
        }

        const remaining = parseFloat(payment.amount) - parseFloat(payment.amount_refunded || 0);
        const refundAmount = amount != null ? parseFloat(amount) : remaining;

        if (!(refundAmount > 0) || refundAmount > remaining + 0.005) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                success: false,
                message: `Refund amount must be between ₹0.01 and ₹${remaining.toFixed(2)}.`
            });
        }

        // Nothing further is written in THIS transaction — refundService
        // opens its own short-lived connection to record the pending
        // refund row, commits, and only then calls Razorpay outside any
        // open transaction/lock (see refundService.initiateRefund).
        await connection.commit();
        connection.release();

        const result = await refundService.initiateRefund(pool, {
            order,
            payment,
            amount: refundAmount,
            reason,
            restock: !!restock,
            idempotencyKey: idempotencyKey || null,
            initiatedBy: req.user.full_name
        });

        return res.json({
            success: true,
            message: 'Refund requested. It will be marked confirmed once Razorpay reports it as processed.',
            refund: result
        });
    } catch (error) {
        try { await connection.rollback(); } catch { /* already committed/released above */ }
        connection.release();
        logger.error({ err: error }, 'Initiate refund error');
        return res.status(error.status || 500).json({
            success: false,
            message: error.publicMessage || 'Error initiating refund.'
        });
    }
};

// Admin: view every refund attempt recorded against an order (created,
// processing, processed, failed) — the local ledger, independent of
// whatever the order's current summary payment_status says.
const getOrderRefunds = async (req, res) => {
    try {
        const [refunds] = await pool.query(
            'SELECT * FROM refunds WHERE order_id = ? ORDER BY created_at DESC',
            [req.params.id]
        );
        return res.json({ success: true, refunds });
    } catch (error) {
        logger.error({ err: error }, 'Get order refunds error');
        return res.status(500).json({ success: false, message: 'Error fetching refunds.' });
    }
};

module.exports = { initiateRefund, getOrderRefunds };