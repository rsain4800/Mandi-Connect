const express = require('express');
const router = express.Router();
const {
    getProductReviews,
    addReview,
    getAdminReviews,
    deleteReview
} = require('../controllers/reviewController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/product/:productId', getProductReviews);
router.post('/', verifyToken, addReview);

// Admin Routes
router.get('/admin-all', verifyToken, requireAdmin, getAdminReviews);
router.delete('/:id', verifyToken, requireAdmin, deleteReview);

module.exports = router;
