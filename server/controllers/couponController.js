const { pool } = require('../config/db');

// Public/Customer: Validate Coupon Code
const validateCoupon = async (req, res) => {
    try {
        const { code, subtotal } = req.body;
        const userId = req.user.id;

        if (!code || !subtotal) {
            return res.status(400).json({ success: false, message: 'Coupon code and subtotal are required.' });
        }

        const [coupons] = await pool.query(
            'SELECT * FROM coupons WHERE code = ? AND is_active = 1',
            [code.toUpperCase()]
        );

        if (coupons.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid or inactive coupon code.' });
        }

        const coupon = coupons[0];
        const today = new Date().toISOString().split('T')[0];

        if (coupon.start_date > today || coupon.expiry_date < today) {
            return res.status(400).json({ success: false, message: 'This coupon code has expired or is not active yet.' });
        }

        if (parseFloat(subtotal) < parseFloat(coupon.min_order_amount)) {
            return res.status(400).json({
                success: false,
                message: `Minimum order subtotal of ₹${coupon.min_order_amount} is required to apply this coupon.`
            });
        }

        // Check global usage limit
        const [globalUsage] = await pool.query('SELECT COUNT(*) as count FROM coupon_usage WHERE coupon_id = ?', [coupon.id]);
        if (globalUsage[0].count >= coupon.usage_limit) {
            return res.status(400).json({ success: false, message: 'Coupon usage limit reached.' });
        }

        // Check per-user limit
        const [userUsage] = await pool.query('SELECT COUNT(*) as count FROM coupon_usage WHERE coupon_id = ? AND user_id = ?', [coupon.id, userId]);
        if (userUsage[0].count >= coupon.per_user_limit) {
            return res.status(400).json({ success: false, message: 'You have reached your maximum usage limit for this coupon.' });
        }

        // Calculate discount amount
        let discount = 0;
        if (coupon.discount_type === 'percentage') {
            discount = (parseFloat(subtotal) * parseFloat(coupon.discount_value)) / 100;
            if (coupon.max_discount && discount > parseFloat(coupon.max_discount)) {
                discount = parseFloat(coupon.max_discount);
            }
        } else {
            discount = parseFloat(coupon.discount_value);
        }

        if (discount > parseFloat(subtotal)) {
            discount = parseFloat(subtotal);
        }

        return res.json({
            success: true,
            message: 'Coupon applied successfully!',
            coupon: {
                id: coupon.id,
                code: coupon.code,
                discount_type: coupon.discount_type,
                discount_value: coupon.discount_value,
                discount_amount: Math.round(discount * 100) / 100
            }
        });
    } catch (error) {
        console.error('Validate coupon error:', error);
        return res.status(500).json({ success: false, message: 'Error validating coupon.' });
    }
};

// Admin: Get all coupons
const getAdminCoupons = async (req, res) => {
    try {
        const [coupons] = await pool.query('SELECT * FROM coupons ORDER BY id DESC');
        return res.json({ success: true, coupons });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching coupons.' });
    }
};

// Admin: Add Coupon
const addCoupon = async (req, res) => {
    try {
        const {
            code,
            discount_type,
            discount_value,
            min_order_amount,
            max_discount,
            start_date,
            expiry_date,
            usage_limit,
            per_user_limit,
            is_active
        } = req.body;

        if (!code || !discount_type || !discount_value || !start_date || !expiry_date) {
            return res.status(400).json({ success: false, message: 'Code, type, value, start and expiry dates are required.' });
        }

        const uppercaseCode = code.toUpperCase();

        const [result] = await pool.query(
            `INSERT INTO coupons (
                code, discount_type, discount_value, min_order_amount, max_discount,
                start_date, expiry_date, usage_limit, per_user_limit, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                uppercaseCode,
                discount_type,
                parseFloat(discount_value),
                parseFloat(min_order_amount || 0),
                max_discount ? parseFloat(max_discount) : null,
                start_date,
                expiry_date,
                parseInt(usage_limit || 100),
                parseInt(per_user_limit || 1),
                is_active !== undefined ? (is_active ? 1 : 0) : 1
            ]
        );

        return res.status(201).json({ success: true, message: 'Coupon created!', coupon_id: result.insertId });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error creating coupon.' });
    }
};

// Admin: Delete Coupon — always deactivates rather than hard-deleting.
// coupon_usage rows are a historical record of discounts actually applied to
// real orders (coupon_usage.coupon_id is ON DELETE RESTRICT at the database
// level), so a coupon that has ever been used can never be hard-deleted.
// Deactivating is the correct action regardless of usage history.
const deleteCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const [existing] = await pool.query('SELECT id FROM coupons WHERE id = ?', [couponId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Coupon not found.' });
        }
        await pool.query('UPDATE coupons SET is_active = 0 WHERE id = ?', [couponId]);
        return res.json({ success: true, message: 'Coupon deactivated.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error deactivating coupon.' });
    }
};

module.exports = {
    validateCoupon,
    getAdminCoupons,
    addCoupon,
    deleteCoupon
};