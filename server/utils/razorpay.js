const Razorpay = require('razorpay');

// ----------------------------------------------------------------------------
// SECURITY: secrets ONLY come from environment variables / secret manager.
// Never hardcode, never return these in any API response, never log them.
// See docs/PRODUCTION_CONFIG.md for how these should be provisioned.
// ----------------------------------------------------------------------------
const {
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET,
} = process.env;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  throw new Error(
    'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. Refusing to start ' +
    'in an unconfigured state — this must never silently fall back to test keys.'
  );
}

if (!RAZORPAY_WEBHOOK_SECRET) {
  throw new Error(
    'RAZORPAY_WEBHOOK_SECRET is not set. Without it webhook signatures ' +
    'cannot be verified and the endpoint must not be started.'
  );
}

const razorpayClient = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// Only the public key id is ever safe to expose to the frontend (Checkout.js
// needs it to open the payment sheet). The secret NEVER leaves this module.
const PUBLIC_KEY_ID = RAZORPAY_KEY_ID;

module.exports = {
  razorpayClient,
  PUBLIC_KEY_ID,
  webhookSecret: RAZORPAY_WEBHOOK_SECRET,
};