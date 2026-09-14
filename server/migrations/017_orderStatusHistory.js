/**
 * order_status_history — append-only audit trail attached to an order.
 * CASCADE on order_id is correct: this table has no independent meaning
 * outside its parent order (which, again, is never hard-deleted in
 * practice — there is no delete-order endpoint anywhere in the app).
 */
exports.up = function up(knex) {
    return knex.schema.createTable('order_status_history', (table) => {
        table.increments('id').primary();
        table.integer('order_id').unsigned().notNullable();
        table.enu(
            'status',
            ['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned', 'Refunded'],
            { useNative: true, enumName: 'order_status_history_status_enum' }
        ).notNullable();
        table.string('comment', 255).nullable();
        table.string('created_by', 100).notNullable().defaultTo('System');
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.index('order_id', 'idx_order_status_history_order');

        table.foreign('order_id', 'fk_order_status_history_order')
            .references('id').inTable('orders')
            .onDelete('CASCADE')
            .onUpdate('CASCADE');
    });
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('order_status_history');
};