const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { upload } = require('./upload');

// JWT Token Authentication Middleware.
// Reads the token from an httpOnly cookie (primary, browser clients) and
// falls back to an Authorization: Bearer header (API/mobile clients).
const verifyToken = async (req, res, next) => {
    try {
        let token = req.cookies && req.cookies.token;

        if (!token) {
            const header = req.headers.authorization;
            if (header && header.startsWith('Bearer ')) {
                token = header.split(' ')[1];
            }
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [users] = await pool.query('SELECT id, full_name, email, phone, role, is_active FROM users WHERE id = ?', [decoded.id]);

        if (users.length === 0 || !users[0].is_active) {
            return res.status(401).json({ success: false, message: 'Invalid or inactive user account.' });
        }

        req.user = users[0];
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Authentication failed. Invalid or expired token.' });
    }
};

// Admin Authorization Middleware (Allows ONLY the single Admin role)
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Access denied. Single Admin authorization required.' });
    }
    next();
};

module.exports = {
    verifyToken,
    requireAdmin,
    // Re-exported so existing `const { verifyToken, upload } = require('../middleware/authMiddleware')`
    // call sites keep working without touching every route file.
    upload
};