/**
 * coupon_usage — one row per (coupon, order) redemption, used to enforce
 * global usage_limit and per_user_limit in couponController.validateCoupon.
 * coupon_id and user_id are RESTRICT (matches the docstring already in
 * couponController.deleteCoupon: "coupon_usage.coupon_id is ON DELETE
 * RESTRICT at the database level" — true now). order_id is CASCADE since
 * this row is really a piece of the order's own record, same reasoning as
 * order_status_history.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('coupon_usage', (table) => {
        table.increments('id').primary();
        table.integer('coupon_id').unsigned().notNullable();
        table.integer('user_id').unsigned().notNullable();
        table.integer('order_id').unsigned().notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.index('coupon_id', 'idx_coupon_usage_coupon');
        table.index('user_id', 'idx_coupon_usage_user');
        table.unique('order_id', { indexName: 'coupon_usage_order_unique' });

        table.foreign('coupon_id', 'fk_coupon_usage_coupon')
            .references('id').inTable('coupons')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');
        table.foreign('user_id', 'fk_coupon_usage_user')
            .references('id').inTable('users')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');
        table.foreign('order_id', 'fk_coupon_usage_order')
            .references('id').inTable('orders')
            .onDelete('CASCADE')
            .onUpdate('CASCADE');
    });
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('coupon_usage');
};