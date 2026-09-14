const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { sendPasswordResetEmail } = require('../utils/emailService');
const logger = require('../utils/logger');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookies');

const JWT_SECRET = process.env.JWT_SECRET;
const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If an account exists for this email, reset instructions have been sent.';

// Customer Register
const registerCustomer = async (req, res) => {
    try {
        const { full_name, email, phone, password } = req.body;

        if (!full_name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide full name, email, and password.' });
        }

        // Check if user exists
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'User with this email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            `INSERT INTO users (full_name, email, phone, password, role)
             VALUES (?, ?, ?, ?, 'customer')`,
            [full_name, email, phone || null, hashedPassword]
        );

        // Auto-create cart & wishlist
        await pool.query('INSERT INTO cart (user_id) VALUES (?)', [result.insertId]);
        await pool.query('INSERT INTO wishlist (user_id) VALUES (?)', [result.insertId]);

        const token = jwt.sign({ id: result.insertId, role: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
        setAuthCookie(res, token);

        return res.status(201).json({
            success: true,
            message: 'Registration successful!',
            user: {
                id: result.insertId,
                full_name,
                email,
                phone: phone || null,
                role: 'customer'
            }
        });
    } catch (error) {
        logger.error({ err: error }, 'Registration error');
        return res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
};

// Customer Login
const loginCustomer = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const [users] = await pool.query('SELECT * FROM users WHERE email = ? AND role = "customer"', [email]);
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid customer email or password.' });
        }

        const user = users[0];
        if (!user.is_active) {
            return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid customer email or password.' });
        }

        const token = jwt.sign({ id: user.id, role: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
        setAuthCookie(res, token);

        return res.json({
            success: true,
            message: 'Login successful!',
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone,
                profile_image: user.profile_image,
                role: 'customer'
            }
        });
    } catch (error) {
        logger.error({ err: error }, 'Login error');
        return res.status(500).json({ success: false, message: 'Server error during login.' });
    }
};

// SINGLE ADMIN LOGIN (Strict Single Admin Account)
const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Admin email and password are required.' });
        }

        // Query single admin user
        const [admins] = await pool.query('SELECT * FROM users WHERE role = "admin" AND email = ?', [email]);
        if (admins.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
        }

        const admin = admins[0];
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
        }

        const token = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
        setAuthCookie(res, token, 24 * 60 * 60 * 1000);

        return res.json({
            success: true,
            message: 'Admin access granted.',
            user: {
                id: admin.id,
                full_name: admin.full_name,
                email: admin.email,
                role: 'admin'
            }
        });
    } catch (error) {
        logger.error({ err: error }, 'Admin login error');
        return res.status(500).json({ success: false, message: 'Server error during admin login.' });
    }
};

// Get User Profile
const getProfile = async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, full_name, email, phone, profile_image, role, created_at FROM users WHERE id = ?', [req.user.id]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        return res.json({ success: true, user: users[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching profile.' });
    }
};

// Update User Profile
const updateProfile = async (req, res) => {
    try {
        const { full_name, phone } = req.body;
        let profile_image = req.user.profile_image;

        if (req.file) {
            profile_image = req.file.url;
        }

        await pool.query(
            'UPDATE users SET full_name = ?, phone = ?, profile_image = ? WHERE id = ?',
            [full_name || req.user.full_name, phone || req.user.phone, profile_image, req.user.id]
        );

        return res.json({
            success: true,
            message: 'Profile updated successfully!',
            user: {
                ...req.user,
                full_name: full_name || req.user.full_name,
                phone: phone || req.user.phone,
                profile_image
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating profile.' });
    }
};

// Forgot Password
// The response is intentionally identical whether or not the email exists,
// and the reset token is NEVER returned in the API response — it is only
// ever delivered via email — to prevent user enumeration and token leakage.
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const [users] = await pool.query('SELECT id, full_name FROM users WHERE email = ?', [email]);

        if (users.length > 0) {
            const user = users[0];
            const resetToken = crypto.randomBytes(32).toString('hex');
            const tokenExpire = new Date(Date.now() + 3600000); // 1 hour

            await pool.query(
                'UPDATE users SET reset_password_token = ?, reset_password_expire = ? WHERE email = ?',
                [resetToken, tokenExpire, email]
            );

            // Fire-and-forget: don't let email delivery timing leak whether the account exists.
            sendPasswordResetEmail({ email, full_name: user.full_name }, resetToken).catch((err) => {
                logger.error({ err }, 'Failed to send password reset email');
            });
        }

        return res.json({ success: true, message: GENERIC_FORGOT_PASSWORD_MESSAGE });
    } catch (error) {
        logger.error({ err: error }, 'Forgot password error');
        // Still return the generic message — don't leak whether the error was
        // "account not found" vs. an internal failure.
        return res.json({ success: true, message: GENERIC_FORGOT_PASSWORD_MESSAGE });
    }
};

// Reset Password
const resetPassword = async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;

        const [users] = await pool.query(
            'SELECT id FROM users WHERE reset_password_token = ? AND reset_password_expire > NOW()',
            [resetToken]
        );

        if (users.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE users SET password = ?, reset_password_token = NULL, reset_password_expire = NULL WHERE id = ?',
            [hashedPassword, users[0].id]
        );

        return res.json({ success: true, message: 'Password reset successfully. You can now login.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Reset password error.' });
    }
};

// Logout — clears the httpOnly auth cookie server-side (the client can't
// delete an httpOnly cookie itself, so this endpoint is required).
const logout = (req, res) => {
    clearAuthCookie(res);
    return res.json({ success: true, message: 'Logged out successfully.' });
};

module.exports = {
    registerCustomer,
    loginCustomer,
    loginAdmin,
    getProfile,
    updateProfile,
    forgotPassword,
    resetPassword,
    logout
};