const express = require('express');
const router = express.Router();
const {
    registerCustomer,
    loginCustomer,
    loginAdmin,
    getProfile,
    updateProfile,
    forgotPassword,
    resetPassword,
    logout
} = require('../controllers/authController');
const { verifyToken, upload } = require('../middleware/authMiddleware');
const { authRateLimiter } = require('../middleware/rateLimiters');
const {
    registerValidation,
    loginValidation,
    adminLoginValidation,
    forgotPasswordValidation,
    resetPasswordValidation
} = require('../validators');

router.post('/register', authRateLimiter, registerValidation, registerCustomer);
router.post('/login', authRateLimiter, loginValidation, loginCustomer);
router.post('/admin-login', authRateLimiter, adminLoginValidation, loginAdmin);
router.post('/logout', logout);
router.get('/profile', verifyToken, getProfile);
router.put('/profile', verifyToken, upload.single('profile_image'), updateProfile);
router.post('/forgot-password', authRateLimiter, forgotPasswordValidation, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPasswordValidation, resetPassword);

module.exports = router;