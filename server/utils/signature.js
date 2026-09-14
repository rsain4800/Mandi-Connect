const crypto = require('crypto');

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay computes: HMAC_SHA256(raw_body, webhook_secret) -> hex digest
 * and sends it in the `X-Razorpay-Signature` header. We recompute it over
 * the untouched raw bytes and compare using a constant-time comparison to
 * avoid timing side-channels.
 *
 * @param {Buffer} rawBody - exact raw request body bytes (NOT re-serialized JSON)
 * @param {string} signatureHeader - value of X-Razorpay-Signature
 * @param {string} secret - webhook secret configured in Razorpay dashboard
 * @returns {boolean}
 */
function verifyRazorpayWebhookSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(String(signatureHeader), 'utf8');

  // timingSafeEqual throws if lengths differ — guard first, and note that
  // a length mismatch is itself just "invalid", not an error to bubble up.
  if (expectedBuf.length !== receivedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Verify the frontend Checkout success payload (razorpay_order_id,
 * razorpay_payment_id, razorpay_signature). This is HMAC_SHA256(order_id +
 * "|" + payment_id, key_secret). This check is SUPPORTING ONLY — it tells us
 * the browser round-trip wasn't tampered with, letting us show an optimistic
 * "processing" UI. It must never by itself confirm/capture/ship an order;
 * only the webhook does that.
 */
function verifyCheckoutHandlerSignature({ orderId, paymentId, signature, keySecret }) {
  if (!orderId || !paymentId || !signature || !keySecret) return false;

  const payload = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(payload)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(String(signature), 'utf8');
  if (expectedBuf.length !== receivedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

module.exports = {
  verifyRazorpayWebhookSignature,
  verifyCheckoutHandlerSignature,
};