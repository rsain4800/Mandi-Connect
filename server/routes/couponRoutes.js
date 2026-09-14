const express = require('express');
const router = express.Router();
const {
    validateCoupon,
    getAdminCoupons,
    addCoupon,
    deleteCoupon
} = require('../controllers/couponController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.post('/validate', verifyToken, validateCoupon);

// Admin Routes
router.get('/admin-list', verifyToken, requireAdmin, getAdminCoupons);
router.post('/', verifyToken, requireAdmin, addCoupon);
router.delete('/:id', verifyToken, requireAdmin, deleteCoupon);

module.exports = router;
