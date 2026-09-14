const { validationResult, body, param } = require('express-validator');
const { ALLOWED_UNITS } = require('../utils/units');
const { validatePriceTiers } = require('../utils/wholesale');

// Runs after a chain of express-validator checks; returns a consistent 400
// shape if any of them failed.
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: errors.array()[0].msg,
            errors: errors.array().map((e) => ({ field: e.path, message: e.msg }))
        });
    }
    next();
};

const PHONE_REGEX = /^[6-9]\d{9}$/; // Indian mobile numbers
const PINCODE_REGEX = /^[1-9]\d{5}$/; // Indian PIN codes

const registerValidation = [
    body('full_name').trim().notEmpty().withMessage('Full name is required.')
        .isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters.'),
    body('email').trim().notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
    body('phone').optional({ checkFalsy: true })
        .matches(PHONE_REGEX).withMessage('Please provide a valid 10-digit Indian mobile number.'),
    body('password').notEmpty().withMessage('Password is required.')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
        .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
    handleValidationErrors
];

const loginValidation = [
    body('email').trim().notEmpty().withMessage('Email is required.').isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required.'),
    handleValidationErrors
];

const adminLoginValidation = loginValidation;

const forgotPasswordValidation = [
    body('email').trim().notEmpty().withMessage('Email is required.').isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
    handleValidationErrors
];

const resetPasswordValidation = [
    body('resetToken').trim().notEmpty().withMessage('Reset token is required.')
        .isHexadecimal().withMessage('Invalid reset token.').isLength({ min: 64, max: 64 }).withMessage('Invalid reset token.'),
    body('newPassword').notEmpty().withMessage('New password is required.')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
        .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
    handleValidationErrors
];

const addressValidation = [
    body('full_name').trim().notEmpty().withMessage('Full name is required.').isLength({ max: 100 }),
    body('phone').trim().notEmpty().withMessage('Phone number is required.').matches(PHONE_REGEX).withMessage('Please provide a valid 10-digit Indian mobile number.'),
    body('house_building').trim().notEmpty().withMessage('House/Building is required.'),
    body('street').trim().notEmpty().withMessage('Street is required.'),
    body('area').trim().notEmpty().withMessage('Area is required.'),
    body('city').trim().notEmpty().withMessage('City is required.'),
    body('state').trim().notEmpty().withMessage('State is required.'),
    body('pincode').trim().notEmpty().withMessage('Pincode is required.').matches(PINCODE_REGEX).withMessage('Please provide a valid 6-digit pincode.'),
    body('address_type').optional().isIn(['home', 'work', 'other']).withMessage('Address type must be home, work, or other.'),
    handleValidationErrors
];

const categoryValidation = [
    body('name').trim().notEmpty().withMessage('Category name is required.').isLength({ max: 100 }),
    body('description').optional({ checkFalsy: true }).isLength({ max: 2000 }),
    handleValidationErrors
];

// Products accept `available_stock` (preferred, matches the wholesale API
// contract — see productController) or the legacy `stock_quantity` field
// name; exactly one of the two must be present. `stockField` below picks
// whichever value the request actually supplied so validation runs against
// it either way, without requiring both.
const productValidation = [
    body('name').trim().notEmpty().withMessage('Product name is required.').isLength({ max: 150 }),
    body('category_id').notEmpty().withMessage('Category is required.').isInt({ min: 1 }).withMessage('Invalid category.'),
    body('price').notEmpty().withMessage('Price is required.').isFloat({ min: 0 }).withMessage('Price must be a positive number.'),
    body('discount_price').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Discount price must be a positive number.')
        .custom((value, { req }) => {
            const price = parseFloat(req.body.price);
            if (value !== undefined && value !== '' && !Number.isNaN(price) && parseFloat(value) > price) {
                throw new Error('Discount price cannot exceed the regular price.');
            }
            return true;
        }),
    body('available_stock')
        .custom((value, { req }) => {
            const raw = req.body.available_stock ?? req.body.stock_quantity;
            if (raw === undefined || raw === null || raw === '') {
                throw new Error('Available stock is required.');
            }
            if (!Number.isInteger(Number(raw)) || Number(raw) < 0) {
                throw new Error('Available stock must be a non-negative whole number.');
            }
            return true;
        }),
    body('unit').optional().isIn(ALLOWED_UNITS).withMessage(`Invalid unit. Must be one of: ${ALLOWED_UNITS.join(', ')}.`),
    body('minimum_order_quantity')
        .optional()
        .isInt({ min: 1 }).withMessage('Minimum order quantity (MOQ) must be a whole number of at least 1.'),
    body('maximum_order_quantity')
        .optional({ checkFalsy: true })
        .isInt({ min: 1 }).withMessage('Maximum order quantity must be a whole number of at least 1.')
        .custom((value, { req }) => {
            const moq = req.body.minimum_order_quantity !== undefined && req.body.minimum_order_quantity !== ''
                ? parseInt(req.body.minimum_order_quantity, 10)
                : 1;
            if (value !== undefined && value !== '' && parseInt(value, 10) < moq) {
                throw new Error('Maximum order quantity cannot be less than the minimum order quantity.');
            }
            return true;
        }),
    body('grade').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
    body('quality').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
    body('origin').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
    body('origin_district').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body('origin_mandi').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
    // price_tiers arrives as a JSON string when the request is multipart
    // (admin product form uploads images alongside product fields).
    body('price_tiers')
        .optional({ checkFalsy: true })
        .custom((value) => {
            let parsed = value;
            if (typeof value === 'string') {
                try {
                    parsed = JSON.parse(value);
                } catch (e) {
                    throw new Error('price_tiers must be valid JSON.');
                }
            }
            if (parsed === undefined || parsed === null) return true;
            if (!Array.isArray(parsed)) {
                throw new Error('price_tiers must be an array.');
            }
            const { valid, message } = validatePriceTiers(parsed);
            if (!valid) throw new Error(message);
            return true;
        }),
    handleValidationErrors
];

const idParamValidation = [
    param('id').isInt({ min: 1 }).withMessage('Invalid id.'),
    handleValidationErrors
];

module.exports = {
    handleValidationErrors,
    registerValidation,
    loginValidation,
    adminLoginValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
    addressValidation,
    categoryValidation,
    productValidation,
    idParamValidation
};