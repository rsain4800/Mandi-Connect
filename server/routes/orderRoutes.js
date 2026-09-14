const express = require('express');
const router = express.Router();
const {
    createOrder,
    getCustomerOrders,
    getOrderDetail,
    getAdminOrders,
    updateOrderStatus,
    cancelOrder,
    requestReturn,
    getOrderInvoice
} = require('../controllers/orderController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.post('/', createOrder);
router.get('/my-orders', getCustomerOrders);
router.get('/admin-all', requireAdmin, getAdminOrders);
router.get('/:id', getOrderDetail);
// Printable/HTML invoice — same access rule as getOrderDetail (owner or
// admin). Placed before the generic '/:id' isn't necessary here since
// Express matches '/:id/invoice' as a more specific path regardless of
// declaration order relative to '/:id', but it's listed right after it
// for readability.
router.get('/:id/invoice', getOrderInvoice);
router.put('/:id/status', requireAdmin, updateOrderStatus);
// Phase 4: lets a customer (or admin) release a reservation/restock a sale
// immediately — e.g. from the Razorpay checkout modal's dismiss/failure
// handler when a customer closes the browser instead of paying — rather
// than waiting up to RESERVATION_TTL_MINUTES for the background sweep.
// orderController.cancelOrder was implemented and exported but had no
// route wired to it; without this, the "browser closes mid-checkout"
// scenario had no way to release stock early.
router.put('/:id/cancel', cancelOrder);
router.post('/:id/return', requestReturn);

module.exports = router;