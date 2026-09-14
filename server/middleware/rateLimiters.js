const rateLimit = require('express-rate-limit');

// General API limiter — generous, just guards against gross abuse/scraping.
const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes.' }
});

// Stricter limiter for auth endpoints (login, register, admin-login,
// forgot-password) — these are the routes attackers actually brute-force.
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // don't penalize the eventual successful login attempt
    message: { success: false, message: 'Too many attempts. Please try again after 15 minutes.' }
});

module.exports = { apiRateLimiter, authRateLimiter };