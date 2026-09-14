/**
 * orderStateMachine.js — Phase 6: the single source of truth for which
 * order_status transitions are legal and which cancellation/return actions
 * a given role may perform at a given status.
 *
 * Every caller (orderController.cancelOrder, orderController.updateOrderStatus,
 * orderController.getOrderDetail's `actions` response, etc.) goes through
 * this module rather than hand-rolling transition rules — so the same
 * policy is enforced everywhere, is testable in isolation, and can be
 * changed in one place.
 */

// ── Valid order_status transitions ─────────────────────────────────────
// Explicit whitelist: if a (from, to) pair is not listed here, the
// transition is rejected. This is deliberately more restrictive than a
// "blocklist of bad transitions" approach — it's easier to reason about
// and extend, and the spec explicitly calls out that invalid transitions
// like DELIVERED → PROCESSING must not be allowed.
//
// Paths through the happy life-cycle:
//   COD:      Pending → Confirmed → Processing → Packed → Shipped
//             → Out for Delivery → Delivered
//   Online:   Pending → Confirmed (via payment capture) → … → Delivered
//   Cancel:   from any eligible state → Cancelled
//   Return:   Delivered → Return Requested → Returned → Refunded
const VALID_TRANSITIONS = {
    'Pending': ['Confirmed', 'Cancelled'],
    'Confirmed': ['Processing', 'Cancelled'],
    'Processing': ['Packed', 'Cancelled'],
    'Packed': ['Shipped', 'Cancelled'],
    'Shipped': ['Out for Delivery', 'Cancelled'],
    'Out for Delivery': ['Delivered', 'Cancelled'],
    'Delivered': ['Return Requested'],
    'Return Requested': ['Returned', 'Delivered'],
    'Returned': ['Refunded'],
    'Cancelled': [],
    'Refunded': []
};

// ── Cancellation policy ───────────────────────────────────────────────
// Customers can self-cancel only while the order is still in an early
// state. Admins get broader latitude. These thresholds are configurable
// through the object below so the business can tune them without code
// changes.
const CANCELLATION_CONFIG = {
    customerAllowedFrom: new Set(['Pending', 'Confirmed']),
    adminAllowedFrom: new Set([
        'Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped',
        'Out for Delivery'
    ]),
    // Once an order has reached Delivered or beyond, neither customer nor
    // admin should "cancel" it — the correct action is a return process.
    // Similarly, Cancelled/Refunded/Return Requested/Returned are
    // terminal or already-handled states.
};

// ── Partial cancellation config ───────────────────────────────────────
// Partial cancellation is only possible before physical packing begins.
// Once items are being packed, cancelling individual lines risks
// inconsistency between what's in the warehouse and what the system
// thinks.
const PARTIAL_CANCEL_ALLOWED_IN = new Set([
    'Pending', 'Confirmed', 'Processing'
]);

// ── Return window ─────────────────────────────────────────────────────
// How many days after delivery a customer may request a return. Derived
// from the 'Delivered' history entry's created_at (not a new orders
// column — see requestReturn in orderController.js).
const RETURN_WINDOW_DAYS = parseInt(process.env.RETURN_WINDOW_DAYS, 10) || 7;

// ── Custom error ──────────────────────────────────────────────────────
class OrderTransitionError extends Error {
    constructor(message, from, to) {
        super(message);
        this.name = 'OrderTransitionError';
        this.from = from;
        this.to = to;
        this.status = 400;
    }
}

// ── Core helpers ──────────────────────────────────────────────────────

/**
 * Throws OrderTransitionError if the transition is not in the whitelist.
 * Use this before executing any status-changing DB write.
 */
const assertValidTransition = (from, to) => {
    if (from === to) return; // no-op, already in target state
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
        throw new OrderTransitionError(
            `Cannot transition from "${from}" to "${to}".`,
            from,
            to
        );
    }
};

/**
 * Returns the list of statuses that `currentStatus` may legally
 * transition to. Useful for rendering "next available actions" in both
 * customer and admin UIs.
 */
const getAllowedNext = (currentStatus) => {
    return VALID_TRANSITIONS[currentStatus] || [];
};

/**
 * Determines whether a cancellation (full or partial) is permitted at
 * the given status for the given role.
 *
 * @param {object} params
 * @param {string} params.status - current order_status
 * @param {string} params.role   - 'admin' | 'customer' (or any other role)
 * @returns {{ allowed: boolean, reason: string }}
 */
const getCancellationDecision = ({ status, role }) => {
    // Already cancelled or refunded — idempotent success, not a new cancel
    if (status === 'Cancelled') {
        return { allowed: true, reason: 'Order is already cancelled.' };
    }

    // Terminal states where "cancel" makes no sense
    if (['Delivered', 'Returned', 'Refunded', 'Return Requested'].includes(status)) {
        return {
            allowed: false,
            reason: `Orders in "${status}" status cannot be cancelled. Use the return/refund process instead.`
        };
    }

    const allowedSet = role === 'admin'
        ? CANCELLATION_CONFIG.adminAllowedFrom
        : CANCELLATION_CONFIG.customerAllowedFrom;

    if (allowedSet.has(status)) {
        return { allowed: true, reason: '' };
    }

    return {
        allowed: false,
        reason: role === 'admin'
            ? `Admin cannot cancel orders in "${status}" status.`
            : `You can no longer cancel this order (status: "${status}"). Please contact support for assistance.`
    };
};

/**
 * Whether partial cancellation (cancelling individual line items) is
 * permitted at the given order status. Partial cancel is only meaningful
 * before physical packing begins.
 */
const canPartiallyCancel = (status) => PARTIAL_CANCEL_ALLOWED_IN.has(status);

module.exports = {
    VALID_TRANSITIONS,
    CANCELLATION_CONFIG,
    PARTIAL_CANCEL_ALLOWED_IN,
    RETURN_WINDOW_DAYS,
    OrderTransitionError,
    assertValidTransition,
    getAllowedNext,
    getCancellationDecision,
    canPartiallyCancel
};
