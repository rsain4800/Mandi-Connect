const { body, validationResult } = require('express-validator');

// Indian mobile numbers: 10 digits, optionally prefixed with +91 / 91 / 0.
const PHONE_REGEX = /^(?:\+91|91|0)?[6-9]\d{9}$/;

// Shared middleware: run this AFTER a validation chain on any route.
// Collects express-validator errors and returns a consistent 400 shape.
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed.',
            errors: errors.array().map((err) => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    next();
};

// POST /api/auth/register
const registerValidation = [
    body('full_name')
        .trim()
        .notEmpty().withMessage('Full name is required.')
        .isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters.'),
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please provide a valid email address.')
        .normalizeEmail(),
    body('phone')
        .optional({ checkFalsy: true })
        .trim()
        .matches(PHONE_REGEX).withMessage('Please provide a valid 10-digit phone number.'),
    body('password')
        .notEmpty().withMessage('Password is required.')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
        .matches(/[a-zA-Z]/).withMessage('Password must contain at least one letter.')
        .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
    handleValidationErrors
];

// POST /api/auth/login
const loginValidation = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please provide a valid email address.')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required.'),
    handleValidationErrors
];

// POST /api/auth/admin-login
const adminLoginValidation = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please provide a valid email address.')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required.'),
    handleValidationErrors
];

// POST /api/auth/forgot-password
const forgotPasswordValidation = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please provide a valid email address.')
        .normalizeEmail(),
    handleValidationErrors
];

// POST /api/auth/reset-password
const resetPasswordValidation = [
    body('resetToken')
        .trim()
        .notEmpty().withMessage('Reset token is required.')
        .isHexadecimal().withMessage('Invalid reset token format.')
        .isLength({ min: 64, max: 64 }).withMessage('Invalid reset token format.'),
    body('newPassword')
        .notEmpty().withMessage('New password is required.')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
        .matches(/[a-zA-Z]/).withMessage('Password must contain at least one letter.')
        .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
    handleValidationErrors
];

module.exports = {
    handleValidationErrors,
    registerValidation,
    loginValidation,
    adminLoginValidation,
    forgotPasswordValidation,
    resetPasswordValidation
};