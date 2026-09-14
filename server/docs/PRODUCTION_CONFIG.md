# MandiConnect — Razorpay Production Configuration

## Overview

MandiConnect uses Razorpay as its sole online payment processor. The
integration follows a webhook-first architecture: the backend webhook
(`POST /api/payments/webhook`) is the **sole source of truth** for payment
state. The frontend payment verification callback is a best-effort UX
shortcut — if it never fires (browser crash, network drop, tab closed), the
webhook still confirms the order on its own.

---

## 1. Environment Variables

These **must** be set before the server starts. The application will refuse
to boot if any are missing (`config/validateEnv.js`).

| Variable | Where to get it | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | Razorpay Dashboard → Settings → API Keys | Use `rzp_live_*` in production. The app warns at startup if you accidentally use a test key. |
| `RAZORPAY_KEY_SECRET` | Same page as above | Shown once on creation. Never committed to code, never exposed in API responses, never logged. |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Dashboard → Settings → Webhooks → your endpoint's secret | A separate secret from the API key. Used only for verifying webhook signatures (HMAC-SHA256). |

### Production checklist

- [ ] `RAZORPAY_KEY_ID` starts with `rzp_live_` (not `rzp_test_`)
- [ ] `RAZORPAY_KEY_SECRET` is the live-mode secret
- [ ] `RAZORPAY_WEBHOOK_SECRET` matches the secret configured on the Razorpay dashboard for the production webhook URL
- [ ] `NODE_ENV=production`
- [ ] `FRONTEND_URL` points to your production frontend domain

---

## 2. Webhook Configuration

### Razorpay Dashboard Setup

1. Go to **Settings → Webhooks**
2. Click **Add New Webhook**
3. **Webhook URL**: `https://your-api-domain.com/api/payments/webhook`
4. **Secret**: Generate a strong random string (e.g. `openssl rand -hex 32`)
   and paste it here. This is your `RAZORPAY_WEBHOOK_SECRET`.
5. **Active Events** — enable at minimum:
   - `payment.authorized`
   - `payment.captured`
   - `payment.failed`
   - `refund.processed`
   - `refund.failed`
6. Save

### How It Works

- Razorpay sends `POST /api/payments/webhook` with a raw JSON body
- The server verifies the `X-Razorpay-Signature` header against the raw body
  using HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`
- Every event is deduplicated by `X-Razorpay-Event-Id` using an INSERT into
  the `webhook_events` table — duplicate deliveries return 200 immediately
  with no side effects
- All event processing happens inside a single DB transaction — either the
  event and its side effects commit together, or both roll back
- The server responds within 5 seconds (email dispatch is fire-and-forget)

### Retry Behavior

- On **2xx** response: Razorpay marks the event as delivered
- On **5xx** response: Razorpay retries with exponential backoff (up to 24h)
- On **4xx** response: Razorpay does not retry (invalid signature, malformed body)
- Retry safety: the `webhook_events` INSERT ensures retries for already-processed
  events are no-ops

---

## 3. Payment States

### `payments.status`

| State | Meaning |
|---|---|
| `created` | Razorpay order created, checkout not yet completed |
| `pending` | Bank/UPI processing (used for async payment methods) |
| `authorized` | Payment authorized by the bank but not yet captured |
| `captured` | Payment captured — money will be settled to your account |
| `failed` | Payment attempt failed |
| `refunded` | Full refund processed |
| `partially_refunded` | Partial refund processed |

### `orders.payment_status`

| State | Meaning |
|---|---|
| `pending` | Awaiting payment (online orders) |
| `paid` | Payment confirmed (by webhook) |
| `failed` | Payment failed or order cancelled before payment |
| `refunded` | Fully refunded (confirmed by webhook) |
| `partially_refunded` | Partially refunded (confirmed by webhook) |

---

## 4. Payment Flow

### Successful Online Payment

```
1. Customer clicks "Pay" → POST /api/payments/create-order
   → Razorpay order created (amount in paise, INR)
   → payments row inserted with status='created'
   → orders.reservation_expires_at set (15 min default)

2. Razorpay Checkout opens in browser
   → Customer completes payment

3. Frontend callback → POST /api/payments/verify (supporting mechanism)
   → HMAC signature verified (orderId|paymentId signed with API key secret)
   → fulfillCapturedPayment() called
   → If first arrival: payment → 'captured', order → 'paid'/'Confirmed'
     reservation → sale (stock_quantity decremented)
   → If already processed: returns success (idempotent)

4. Webhook → POST /api/payments/webhook (source of truth)
   → X-Razorpay-Signature verified against raw body
   → Event deduplicated by X-Razorpay-Event-Id
   → fulfillCapturedPayment() called
   → Same idempotent logic as step 3
   → Emails dispatched (fire-and-forget)
```

Whichever arrives first (frontend callback or webhook) fulfills the order.
The other is a no-op. If the frontend callback never arrives (browser crash),
the webhook handles everything.

### Failed Payment

```
1. Webhook payment.failed → markPaymentFailed()
   → payment.status = 'failed'
   → Inventory reservation released
   → order.order_status = 'Cancelled', order.payment_status = 'failed'
   → Order status history recorded
```

### Reservation Expiry

Online orders that don't complete payment within `RESERVATION_TTL_MINUTES`
(default: 15 minutes) have their held stock released by the background sweep
(`server.js` → `inventoryService.releaseExpiredReservations`). This sweep runs
every 5 minutes by default.

---

## 5. Refund Flow

Refunds are **never** initiated by directly setting `payment_status` in the
database. The flow is:

```
1. Admin clicks "Refund" → POST /api/payments/admin/orders/:id/refund
   → Validates payment_status is 'paid' or 'partially_refunded'
   → Validates refund amount ≤ remaining refundable
   → Creates pending refunds row (status='created')
   → Calls Razorpay refund API (OUTSIDE the DB transaction)
   → Refund row updated to status='processing'

2. Webhook refund.processed → refundService.finalizeRefund()
   → Locates or creates refunds row (handles dashboard-initiated refunds)
   → refund status → 'processed'
   → payment.amount_refunded updated, payment.status → 'refunded'/'partially_refunded'
   → order.payment_status → 'refunded'/'partially_refunded'
   → Inventory: either restocks (if restock=true) or logs audit row
   → Order status history recorded

3. Webhook refund.failed → refundService.markRefundFailed()
   → refund status → 'failed'
   → Order/payment unchanged (money was never returned)
   → Admin can see the failure and retry
```

### Idempotency

- **Admin double-click**: `idempotency_key` column prevents duplicate
  Razorpay API calls
- **Duplicate webhook**: `razorpay_refund_id` uniqueness + status check
  prevents double-processing
- **Dashboard-initiated refund**: `findOrCreateRefundRow` reconciles
  webhooks for refunds never initiated through the app

---

## 6. Security

### Never Expose

- `RAZORPAY_KEY_SECRET` — server-side only, never in API responses
- `RAZORPAY_WEBHOOK_SECRET` — server-side only
- Full card numbers, CVVs, or bank account details — Razorpay never sends these
- The `razorpay_signature` field — stored for audit, never returned to the client

### Logging

All sensitive payment fields are redacted by the Pino logger configuration
(`utils/logger.js`):

- `razorpay_signature`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `req.headers["x-razorpay-signature"]`

### CORS

The webhook endpoint is mounted **before** CORS middleware — Razorpay's servers
have no browser Origin header and must reach the endpoint without CORS
restrictions.

### Webhook Route

The webhook route is mounted **before** `express.json()`, `cookieParser()`,
`verifyToken`, and rate limiters. This is intentional:

- Razorpay sends a raw Buffer body that must not be re-serialized before
  signature verification
- Razorpay has no JWT/cookie — auth middleware would reject it
- Razorpay's retry traffic shape shouldn't compete with the per-IP rate limit

---

## 7. Database

### Tables

| Table | Purpose |
|---|---|
| `payments` | One row per Razorpay order attempt. Tracks status, amounts, refund totals. |
| `webhook_events` | Idempotency ledger for webhook deliveries. Unique on `event_id`. |
| `refunds` | One row per refund attempt. Supports partial refunds and restock tracking. |
| `orders` | `payment_status` and `reservation_expires_at` columns added for Phase 4-5. |
| `inventory_transactions` | Append-only ledger of all stock movements (Phase 4). |

### Key Constraints

- `payments.razorpay_order_id` — UNIQUE (one payment row per Razorpay order)
- `payments.razorpay_payment_id` — UNIQUE (one payment row per Razorpay payment)
- `payments.amount_refunded >= 0` and `<= amount` (CHECK constraints)
- `webhook_events.event_id` — UNIQUE (idempotency)
- `refunds.razorpay_refund_id` — UNIQUE
- `refunds.idempotency_key` — UNIQUE (admin double-click protection)
- `refunds.amount >= 0` (CHECK constraint)
- `refunds.order_id` → `orders.id` RESTRICT (financial records survive order deletion)
- `refunds.payment_id` → `payments.id` RESTRICT

---

## 8. Pre-Production Test Checklist

Before switching from test to live mode, verify:

| Scenario | Expected behavior |
|---|---|
| Successful payment (webhook) | Order confirmed, stock decremented, emails sent |
| Successful payment (frontend callback) | Same as above, instant UX |
| Both arrive simultaneously | Only one fulfills, idempotent |
| Failed payment | Order cancelled, stock released |
| Cancelled checkout | Order cancelled, stock released |
| Duplicate webhook delivery | Second is silently ignored |
| Invalid webhook signature | 400 response, no side effects |
| Delayed webhook (server restart) | Still processed when webhook arrives |
| Frontend crash after payment | Webhook confirms order eventually |
| Refund (full) | Order → refunded, inventory audit logged |
| Refund (partial) | Order → partially_refunded |
| Refund with restock | Stock quantity restored |
| Duplicate refund request | Idempotency key returns existing attempt |
| Dashboard-initiated refund | Reconciled via webhook |
| Refund failure | Refund row marked failed, order unchanged |
| Reservation expiry | Stock released after TTL |

---

## 9. Monitoring

### Key Metrics to Watch

- Webhook delivery success rate (should be ~100% with retries)
- Webhook processing latency (should be < 2 seconds)
- Failed payment rate
- Refund failure rate
- `webhook_events` table growth (archive events older than 90 days)
- `payments` rows stuck in `created` or `authorized` state (stale checkouts)

### Logs to Monitor

- `ERROR: RAZORPAY_WEBHOOK_SECRET is not configured` — misconfigured deployment
- `WARN: Razorpay webhook signature verification failed` — potential attack
- `WARN: Duplicate Razorpay webhook delivery ignored` — expected, but high volume may indicate a Razorpay issue
- `ERROR: Razorpay refund API call failed` — needs manual admin attention
- `WARN: Refund failed at Razorpay` — needs manual follow-up
