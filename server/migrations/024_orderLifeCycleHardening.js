/**
 * Phase 6 — Production Order Lifecycle.
 *
 * Three things land here, all additive (no existing column is renamed or
 * dropped, no historical row is touched — see the "historical integrity"
 * requirement in the Phase 6 spec):
 *
 * 1. `orders.order_status` and `order_status_history.status` both gain
 *    'Return Requested' — the missing intermediate state between a
 *    customer asking for a return and an admin actually approving/rejecting
 *    it (previously the only way to reach 'Returned' was an admin setting
 *    it directly, with no request/approval step and no way for a customer
 *    to initiate one at all — see services/orderStateMachine.js).
 *
 * 2. `order_status_history` gains `old_status` — the spec's audit record
 *    shape is `order_id, old_status, new_status, changed_by, reason,
 *    created_at`; this table already had new_status (as `status`),
 *    changed_by (as `created_by`), reason (as `comment`), and created_at,
 *    but never recorded what the status was being changed FROM. Nullable
 *    because historical rows genuinely have no old_status to backfill (the
 *    column didn't exist yet when they were written) — that's honest, not a
 *    workaround; every row written from this migration forward always
 *    populates it (see controllers/orderController.js).
 *
 * 3. `order_items` gains `cancelled_quantity` and `returned_quantity`
 *    (both default 0) — what makes partial cancellation possible without
 *    ever mutating the original `quantity`/`price`/`total_price` snapshot
 *    a customer was actually charged. An item's still-active quantity is
 *    always `quantity - cancelled_quantity - returned_quantity`, computed
 *    at read time; the row itself never lies about what was originally
 *    ordered. CHECK constraints keep both columns from ever exceeding the
 *    original quantity, together or apart.
 */
exports.up = async function up(knex) {
    // --- orders.order_status ---------------------------------------------
    await knex.raw(
        "ALTER TABLE `orders` MODIFY `order_status` " +
        "ENUM('Pending','Confirmed','Processing','Packed','Shipped','Out for Delivery','Delivered'," +
        "'Cancelled','Return Requested','Returned','Refunded') " +
        "NOT NULL DEFAULT 'Pending'"
    );

    // --- order_status_history ----------------------------------------------
    await knex.raw(
        "ALTER TABLE `order_status_history` MODIFY `status` " +
        "ENUM('Pending','Confirmed','Processing','Packed','Shipped','Out for Delivery','Delivered'," +
        "'Cancelled','Return Requested','Returned','Refunded') " +
        "NOT NULL"
    );
    await knex.schema.alterTable('order_status_history', (table) => {
        table.enu(
            'old_status',
            ['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered',
                'Cancelled', 'Return Requested', 'Returned', 'Refunded'],
            { useNative: true, enumName: 'order_status_history_old_status_enum' }
        ).nullable().after('order_id');
    });

    // --- order_items ---------------------------------------------------------
    await knex.schema.alterTable('order_items', (table) => {
        table.integer('cancelled_quantity').unsigned().notNullable().defaultTo(0);
        table.integer('returned_quantity').unsigned().notNullable().defaultTo(0);
    });
    await knex.raw(
        'ALTER TABLE `order_items` ' +
        'ADD CONSTRAINT `chk_order_items_cancelled_le_qty` CHECK (`cancelled_quantity` <= `quantity`), ' +
        'ADD CONSTRAINT `chk_order_items_returned_le_qty` CHECK (`returned_quantity` <= `quantity`), ' +
        'ADD CONSTRAINT `chk_order_items_cancel_return_le_qty` CHECK ((`cancelled_quantity` + `returned_quantity`) <= `quantity`)'
    );
};

exports.down = async function down(knex) {
    await knex.raw(
        'ALTER TABLE `order_items` ' +
        'DROP CONSTRAINT `chk_order_items_cancelled_le_qty`, ' +
        'DROP CONSTRAINT `chk_order_items_returned_le_qty`, ' +
        'DROP CONSTRAINT `chk_order_items_cancel_return_le_qty`'
    );
    await knex.schema.alterTable('order_items', (table) => {
        table.dropColumn('cancelled_quantity');
        table.dropColumn('returned_quantity');
    });

    await knex.schema.alterTable('order_status_history', (table) => {
        table.dropColumn('old_status');
    });
    await knex.raw(
        "ALTER TABLE `order_status_history` MODIFY `status` " +
        "ENUM('Pending','Confirmed','Processing','Packed','Shipped','Out for Delivery','Delivered'," +
        "'Cancelled','Returned','Refunded') NOT NULL"
    );

    await knex.raw(
        "ALTER TABLE `orders` MODIFY `order_status` " +
        "ENUM('Pending','Confirmed','Processing','Packed','Shipped','Out for Delivery','Delivered'," +
        "'Cancelled','Returned','Refunded') NOT NULL DEFAULT 'Pending'"
    );
};