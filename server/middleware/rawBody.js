/**
 * Razorpay's webhook signature (X-Razorpay-Signature) is an HMAC-SHA256 of
 * the EXACT raw request bytes. If Express/body-parser has already parsed
 * and re-serialized the JSON before we compute the HMAC, whitespace/key
 * ordering differences will make every signature check fail (or worse,
 * someone "fixes" that by trusting an unverified body).
 *
 * This middleware must be mounted BEFORE any express.json() body parser,
 * and ONLY on the webhook route — it captures the raw Buffer and attaches
 * it as req.rawBody, then still gives you req.body (parsed) for convenience
 * AFTER verification happens.
 */
const express = require('express');

const rawBodyCapture = express.json({
  verify: (req, _res, buf) => {
    req.rawBody = Buffer.from(buf); // exact bytes as received
  },
  // Razorpay webhook payloads are small; cap defensively against abuse.
  limit: '1mb',
});

module.exports = { rawBodyCapture };