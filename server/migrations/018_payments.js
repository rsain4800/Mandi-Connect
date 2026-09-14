/**
 * payments — one row per Razorpay order attempt (paymentController inserts
 * on createRazorpayOrder, then updates the same row by razorpay_order_id
 * on verifyPayment). order_id uses RESTRICT — a payment record must never
 * be able to disappear via an order deletion, even though no such endpoint
 * exists today (defense in depth for financial records, per project rule
 * "preserve historical ... payments").
 *
 * Unique constraints on razorpay_order_id / razorpay_payment_id satisfy
 * Phase 1 Step 7 ("unique payment IDs") and double as a database-level
 * guard against ever recording two payment rows for the same gateway
 * order/payment id — MySQL unique indexes allow multiple NULLs, so this
 * doesn't block the pre-capture rows where payment_id is still null.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('payments', (table) => {
        table.increments('id').primary();
        table.integer('order_id').unsigned().notNullable();
        table.string('razorpay_order_id', 100).nullable();
        table.string('razorpay_payment_id', 100).nullable();
        table.string('razorpay_signature', 255).nullable();
        table.decimal('amount', 10, 2).notNullable();
        table.string('currency', 10).notNullable().defaultTo('INR');
        table.enu(
            'status',
            ['created', 'authorized', 'captured', 'failed', 'refunded'],
            { useNative: true, enumName: 'payments_status_enum' }
        ).notNullable().defaultTo('created');
        table.string('payment_method', 50).nullable();
        table.text('raw_response').nullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.index('order_id', 'idx_payments_order');
        table.unique('razorpay_order_id', { indexName: 'payments_razorpay_order_unique' });
        table.unique('razorpay_payment_id', { indexName: 'payments_razorpay_payment_unique' });

        table.foreign('order_id', 'fk_payments_order')
            .references('id').inTable('orders')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');

        table.check('?? >= 0', ['amount'], 'chk_payments_amount_nonneg');
    }).then(() => (
        knex.raw(
            'ALTER TABLE `payments` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('payments');
};