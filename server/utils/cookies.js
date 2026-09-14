const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches the customer JWT expiry

const isSecure = () => process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';

function cookieOptions(maxAgeMs = COOKIE_MAX_AGE_MS) {
    return {
        httpOnly: true,
        secure: isSecure(),
        // 'none' is required for cross-site (different domain) frontend/backend deployments,
        // but that only works over HTTPS, hence tying it to the same secure flag.
        sameSite: isSecure() ? 'none' : 'lax',
        maxAge: maxAgeMs,
        path: '/'
    };
}

function setAuthCookie(res, token, maxAgeMs) {
    res.cookie(COOKIE_NAME, token, cookieOptions(maxAgeMs));
}

function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
}

module.exports = { setAuthCookie, clearAuthCookie, COOKIE_NAME };