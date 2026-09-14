/**
 * Phase 5 — Razorpay production hardening.
 *
 * Three things land here:
 *
 * 1. `payments.status` gets the two states the spec calls for that the
 *    original enum (migrations/018_payments.js) didn't have: 'pending'
 *    (Razorpay order created, checkout not yet completed — currently
 *    modelled as 'created', kept for backwards compat, 'pending' is used
 *    going forward wherever a payment is awaiting a bank/UPI response) and
 *    'partially_refunded' (a refund was processed for less than the full
 *    captured amount). Also adds `amount_refunded` (running total, source
 *    of truth for whether a payment is fully vs partially refunded),
 *    `error_code`/`error_description` (from payment.failed webhooks —
 *    non-sensitive Razorpay error metadata, safe to store, useful for
 *    support), and `captured_at`.
 *
 * 2. `orders.payment_status` gets 'partially_refunded' to mirror the
 *    payment-level state onto the order the customer/admin actually looks
 *    at.
 *
 * 3. Two new tables:
 *      - `webhook_events`: the idempotency ledger for every Razorpay
 *        webhook delivery. Unique on `event_id` (Razorpay's
 *        X-Razorpay-Event-Id header — see utils/verifyWebhookSignature.js
 *        and controllers/webhookController.js) so a duplicate delivery
 *        (Razorpay explicitly documents that the same event can be sent
 *        more than once) is rejected by the database itself before any
 *        business logic runs, inside the same transaction as that logic.
 *      - `refunds`: one row per refund attempt (Step 7). Separate from
 *        `payments` because a single captured payment can be refunded
 *        multiple times (partial refunds). `idempotency_key` is an
 *        application-level dedupe for the admin-initiated refund request
 *        itself (protects against a double-click/double-submit before a
 *        `razorpay_refund_id` even exists yet); `razorpay_refund_id` is
 *        the dedupe for the actual gateway result once we have one.
 */
exports.up = async function up(knex) {
    // --- payments -----------------------------------------------------
    await knex.raw(
        "ALTER TABLE `payments` MODIFY `status` " +
        "ENUM('created','pending','authorized','captured','failed','refunded','partially_refunded') " +
        "NOT NULL DEFAULT 'created'"
    );

    await knex.schema.alterTable('payments', (table) => {
        table.decimal('amount_refunded', 10, 2).notNullable().defaultTo(0);
        table.string('error_code', 50).nullable();
        table.string('error_description', 255).nullable();
        table.timestamp('captured_at').nullable();
    });

    await knex.raw(
        'ALTER TABLE `payments` ADD CONSTRAINT `chk_payments_refunded_nonneg` CHECK (`amount_refunded` >= 0), ' +
        'ADD CONSTRAINT `chk_payments_refunded_le_amount` CHECK (`amount_refunded` <= `amount`)'
    );

    // --- orders ---------------------------------------------------------
    await knex.raw(
        "ALTER TABLE `orders` MODIFY `payment_status` " +
        "ENUM('pending','paid','failed','refunded','partially_refunded') " +
        "NOT NULL DEFAULT 'pending'"
    );

    // --- webhook_events ---------------------------------------------------
    await knex.schema.createTable('webhook_events', (table) => {
        table.increments('id').primary();
        table.string('event_id', 100).notNullable();
        table.string('event_type', 100).notNullable();
        // Best-effort extracted id (payment/refund/order id) purely for
        // observability/debugging — never used for dedupe (event_id is).
        table.string('entity_id', 100).nullable();
        // Full raw JSON body for audit/replay. Razorpay webhook payloads
        // contain payment/order/refund metadata (ids, amounts, status,
        // masked card/bank info) — never full card numbers, CVVs, or
        // credentials, so this is safe to retain. Never log this column's
        // content outside of direct DB inspection (see utils/logger.js
        // redaction list for the *transport* side of the same rule).
        table.text('payload', 'longtext').notNullable();
        table.timestamp('processed_at').nullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.unique('event_id', { indexName: 'webhook_events_event_id_unique' });
        table.index('event_type', 'idx_webhook_events_type');
        table.index('created_at', 'idx_webhook_events_created_at');
    });

    // --- refunds ---------------------------------------------------------
    await knex.schema.createTable('refunds', (table) => {
        table.increments('id').primary();
        table.integer('order_id').unsigned().notNullable();
        table.integer('payment_id').unsigned().notNullable();
        table.string('razorpay_refund_id', 100).nullable();
        table.string('idempotency_key', 64).nullable();
        table.decimal('amount', 10, 2).notNullable();
        // Whether this refund corresponds to goods physically coming back
        // (restock the sale) vs a goodwill/damaged-goods refund (no stock
        // movement) — mirrors the RETURN vs REFUND distinction already
        // established in services/inventoryService.js.
        table.boolean('restock').notNullable().defaultTo(false);
        table.enu(
            'status',
            ['created', 'processing', 'processed', 'failed'],
            { useNative: true, enumName: 'refunds_status_enum' }
        ).notNullable().defaultTo('created');
        table.text('notes').nullable();
        table.string('initiated_by', 100).notNullable().defaultTo('System');
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.index('order_id', 'idx_refunds_order');
        table.index('payment_id', 'idx_refunds_payment');
        table.unique('razorpay_refund_id', { indexName: 'refunds_razorpay_refund_unique' });
        table.unique('idempotency_key', { indexName: 'refunds_idempotency_key_unique' });

        table.foreign('order_id', 'fk_refunds_order')
            .references('id').inTable('orders')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');
        table.foreign('payment_id', 'fk_refunds_payment')
            .references('id').inTable('payments')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');

        table.check('?? >= 0', ['amount'], 'chk_refunds_amount_nonneg');
    }).then(() => (
        knex.raw(
            'ALTER TABLE `refunds` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('refunds');
    await knex.schema.dropTableIfExists('webhook_events');

    await knex.raw(
        "ALTER TABLE `orders` MODIFY `payment_status` " +
        "ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending'"
    );

    await knex.raw(
        'ALTER TABLE `payments` DROP CONSTRAINT `chk_payments_refunded_nonneg`, ' +
        'DROP CONSTRAINT `chk_payments_refunded_le_amount`'
    );
    await knex.schema.alterTable('payments', (table) => {
        table.dropColumn('amount_refunded');
        table.dropColumn('error_code');
        table.dropColumn('error_description');
        table.dropColumn('captured_at');
    });
    await knex.raw(
        "ALTER TABLE `payments` MODIFY `status` " +
        "ENUM('created','authorized','captured','failed','refunded') NOT NULL DEFAULT 'created'"
    );
};