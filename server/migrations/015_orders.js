/**
 * orders — the core business record. Two Phase 1 audit findings fixed here:
 *
 * 1. schema.sql never declared a foreign key for `address_id` at all, even
 *    though the column exists and is populated by createOrder(). That's a
 *    referential-integrity gap (a deleted/renumbered address could leave
 *    orders pointing at nothing, silently, with no database-level
 *    protection either way). Added as ON DELETE SET NULL: an order must
 *    survive its address being removed (addressController.deleteAddress
 *    does a hard delete with no historical-preservation logic today —
 *    flagged separately in PHASE1_DB_AUDIT.md), which is safe specifically
 *    *because* orders already snapshot shipping_full_name, shipping_phone,
 *    and shipping_address_text as plain text at checkout time — the order
 *    never actually depends on the address row still existing.
 *
 * 2. user_id uses RESTRICT rather than the CASCADE it would default to,
 *    per the "preserve historical orders" rule — even though no user
 *    hard-delete endpoint exists today, the database should not silently
 *    allow a customer's order history to vanish if one is ever added.
 *
 * Indexes added: payment_status and created_at were not indexed in
 * schema.sql despite being filtered/sorted on constantly — getAdminOrders
 * filters by payment_status, and adminDashboardController's today/monthly
 * sales, analytics trends, and "recent orders" queries all filter or sort
 * on created_at.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('orders', (table) => {
        table.increments('id').primary();
        table.string('order_number', 50).notNullable();
        table.integer('user_id').unsigned().notNullable();
        table.integer('address_id').unsigned().nullable();
        table.string('shipping_full_name', 100).notNullable();
        table.string('shipping_phone', 20).notNullable();
        table.text('shipping_address_text').notNullable();
        table.decimal('subtotal', 10, 2).notNullable();
        table.decimal('discount_amount', 10, 2).notNullable().defaultTo(0);
        table.string('coupon_code', 50).nullable();
        table.decimal('shipping_charge', 10, 2).notNullable().defaultTo(0);
        table.decimal('tax_amount', 10, 2).notNullable().defaultTo(0);
        table.decimal('total_amount', 10, 2).notNullable();
        table.enu(
            'payment_method',
            ['online', 'cod'],
            { useNative: true, enumName: 'orders_payment_method_enum' }
        ).notNullable().defaultTo('cod');
        table.enu(
            'payment_status',
            ['pending', 'paid', 'failed', 'refunded'],
            { useNative: true, enumName: 'orders_payment_status_enum' }
        ).notNullable().defaultTo('pending');
        table.enu(
            'order_status',
            ['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned', 'Refunded'],
            { useNative: true, enumName: 'orders_status_enum' }
        ).notNullable().defaultTo('Pending');
        table.string('courier_provider', 100).nullable();
        table.string('tracking_number', 100).nullable();
        table.date('estimated_delivery_date').nullable();
        table.text('notes').nullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.unique('order_number', { indexName: 'idx_order_number' });
        table.index('order_status', 'idx_order_status');
        table.index('payment_status', 'idx_order_payment_status');
        table.index('user_id', 'idx_order_user');
        table.index('address_id', 'idx_order_address');
        table.index('created_at', 'idx_order_created_at');

        table.foreign('user_id', 'fk_orders_user')
            .references('id').inTable('users')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');
        table.foreign('address_id', 'fk_orders_address')
            .references('id').inTable('addresses')
            .onDelete('SET NULL')
            .onUpdate('CASCADE');

        table.check('?? >= 0', ['subtotal'], 'chk_orders_subtotal_nonneg');
        table.check('?? >= 0', ['discount_amount'], 'chk_orders_discount_nonneg');
        table.check('?? >= 0', ['shipping_charge'], 'chk_orders_shipping_nonneg');
        table.check('?? >= 0', ['tax_amount'], 'chk_orders_tax_nonneg');
        table.check('?? >= 0', ['total_amount'], 'chk_orders_total_nonneg');
    }).then(() => (
        knex.raw(
            'ALTER TABLE `orders` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('orders');
};