const crypto = require('crypto');

/**
 * Verifies a Razorpay payment signature.
 * Pulled out as a pure function (no DB/network access) so it can be
 * unit tested directly.
 *
 * @param {string} orderId - razorpay_order_id
 * @param {string} paymentId - razorpay_payment_id
 * @param {string} signature - razorpay_signature to verify
 * @param {string} secret - Razorpay key secret
 * @returns {boolean}
 */
function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
    if (!orderId || !paymentId || !signature || !secret) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

    // Constant-time comparison to avoid timing attacks.
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const providedBuffer = Buffer.from(signature, 'hex');

    if (expectedBuffer.length !== providedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

module.exports = { verifyRazorpaySignature };