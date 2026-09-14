const { pool } = require('../config/db');

// Public: Get Product Reviews
const getProductReviews = async (req, res) => {
    try {
        const productId = req.params.productId;
        const [reviews] = await pool.query(
            `SELECT r.*, u.full_name, u.profile_image
             FROM reviews r
             JOIN users u ON r.user_id = u.id
             WHERE r.product_id = ? AND r.is_approved = 1
             ORDER BY r.created_at DESC`,
            [productId]
        );
        return res.json({ success: true, reviews });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching reviews.' });
    }
};

// Customer: Add Review (Enforces Verified Buyer Rule)
const addReview = async (req, res) => {
    try {
        const { product_id, rating, comment } = req.body;
        const userId = req.user.id;

        if (!product_id || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Please provide valid product ID and 1-5 star rating.' });
        }

        // VERIFIED BUYER CHECK: User must have an order containing this product
        const [purchases] = await pool.query(
            `SELECT oi.id
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             WHERE o.user_id = ? AND oi.product_id = ? AND o.order_status IN ('Delivered', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery')`,
            [userId, product_id]
        );

        if (purchases.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Verified buyer requirement: You can only review products that you have purchased on Mandi Connect.'
            });
        }

        // Insert or Update review
        await pool.query(
            `INSERT INTO reviews (product_id, user_id, rating, comment, is_approved)
             VALUES (?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
            [product_id, userId, parseInt(rating), comment || null]
        );

        return res.status(201).json({ success: true, message: 'Thank you! Your review has been published.' });
    } catch (error) {
        console.error('Add Review Error:', error);
        return res.status(500).json({ success: false, message: 'Error adding review.' });
    }
};

// Admin: Get All Reviews
const getAdminReviews = async (req, res) => {
    try {
        const [reviews] = await pool.query(
            `SELECT r.*, u.full_name, u.email, p.name as product_name
             FROM reviews r
             JOIN users u ON r.user_id = u.id
             JOIN products p ON r.product_id = p.id
             ORDER BY r.created_at DESC`
        );
        return res.json({ success: true, reviews });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching admin reviews.' });
    }
};

// Admin: Delete Review
const deleteReview = async (req, res) => {
    try {
        const reviewId = req.params.id;
        await pool.query('DELETE FROM reviews WHERE id = ?', [reviewId]);
        return res.json({ success: true, message: 'Review deleted.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error deleting review.' });
    }
};

module.exports = {
    getProductReviews,
    addReview,
    getAdminReviews,
    deleteReview
};
