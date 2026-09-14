const express = require('express');
const router = express.Router();
const {
    createRazorpayOrder,
    verifyPayment
} = require('../controllers/paymentController');
const { initiateRefund, getOrderRefunds } = require('../controllers/refundController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

// NOTE: the Razorpay webhook endpoint (POST /api/payments/webhook) is
// intentionally NOT part of this router — it is mounted directly in
// server.js, before verifyToken/express.json(), because Razorpay's
// servers call it with no session/cookie/JWT and need the raw request
// body for signature verification. See controllers/webhookController.js.

router.use(verifyToken);

router.post('/create-order', createRazorpayOrder);
router.post('/verify', verifyPayment);

// Admin: refunds (Phase 5 Step 7). Only requests a refund from Razorpay —
// the order is only ever marked refunded once the webhook confirms it.
router.post('/admin/orders/:id/refund', requireAdmin, initiateRefund);
router.get('/admin/orders/:id/refunds', requireAdmin, getOrderRefunds);

module.exports = router;