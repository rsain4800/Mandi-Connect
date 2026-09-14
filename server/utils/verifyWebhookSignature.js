const crypto = require('crypto');

/**
 * Verifies a Razorpay WEBHOOK signature (X-Razorpay-Signature header).
 *
 * This is deliberately a *separate* function from
 * utils/verifySignature.js's `verifyRazorpaySignature` — the two check
 * completely different things, signed with different secrets:
 *   - verifySignature.js: the browser checkout success callback
 *     (`order_id|payment_id` signed with the API key secret). Only ever a
 *     supporting signal (see paymentController.verifyPayment) — a
 *     malicious or buggy client could simply never call it.
 *   - This one: the server-to-server webhook body, signed with a
 *     dashboard-configured *webhook* secret that never touches the
 *     browser. This is the one Razorpay itself sends, which is what makes
 *     it the actual source of truth.
 *
 * CRITICAL: `rawBody` must be the exact, unmodified bytes Razorpay sent —
 * not a re-serialized JSON.stringify(parsedBody). Whitespace, key
 * ordering, or number formatting differences between the original bytes
 * and a re-serialized copy will change the HMAC and make a legitimate
 * webhook look forged. This is why the webhook route is mounted with
 * `express.raw()` ahead of the global `express.json()` body parser (see
 * server.js) — by the time this function runs, `rawBody` must still be
 * the original Buffer/string, never something that has already been
 * through `JSON.parse` + re-stringify.
 *
 * @param {Buffer|string} rawBody - exact raw request body bytes
 * @param {string} signature - value of the X-Razorpay-Signature header
 * @param {string} secret - webhook secret configured on the Razorpay dashboard
 * @returns {boolean}
 */
function verifyRazorpayWebhookSignature(rawBody, signature, secret) {
    if (!rawBody || !signature || !secret) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

    // Constant-time comparison to avoid timing attacks — same convention
    // as verifyRazorpaySignature in utils/verifySignature.js.
    let providedBuffer;
    try {
        providedBuffer = Buffer.from(signature, 'hex');
    } catch {
        return false;
    }
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (expectedBuffer.length !== providedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

module.exports = { verifyRazorpayWebhookSignature };