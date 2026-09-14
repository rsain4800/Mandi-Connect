/**
 * Phase 4 — orders.reservation_expires_at.
 *
 * Only meaningful for payment_method='online' orders that are still
 * order_status='Pending'/payment_status='pending': it's the deadline by
 * which the customer must complete payment before the stock held for them
 * is released back to general availability (see inventoryService's
 * RESERVATION_TTL_MINUTES + releaseExpiredReservations()).
 *
 * COD orders never set this — they skip the reservation phase entirely
 * (stock moves straight from available to sold at order creation, inside
 * the same locked transaction, since there is no separate payment-capture
 * step to wait for).
 *
 * NULLable + indexed so the expiry sweep's query
 * (`WHERE reservation_expires_at < NOW() AND order_status = 'Pending'`) can
 * use the index and never has to scan COD/already-settled rows.
 */
exports.up = function up(knex) {
    return knex.schema.alterTable('orders', (table) => {
        table.timestamp('reservation_expires_at').nullable();
        table.index('reservation_expires_at', 'idx_orders_reservation_expiry');
    });
};

exports.down = function down(knex) {
    return knex.schema.alterTable('orders', (table) => {
        table.dropIndex('reservation_expires_at', 'idx_orders_reservation_expiry');
        table.dropColumn('reservation_expires_at');
    });
};