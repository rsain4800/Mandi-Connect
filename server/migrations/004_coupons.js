/**
 * coupons — discount codes. Deletion is always a soft deactivation
 * (couponController.deleteCoupon sets is_active = 0) so that coupon_usage
 * history for orders that already applied a coupon stays intact — see
 * v016_coupon_usage.js's RESTRICT FK back to this table.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('coupons', (table) => {
        table.increments('id').primary();
        table.string('code', 50).notNullable();
        table.enu(
            'discount_type',
            ['percentage', 'fixed'],
            { useNative: true, enumName: 'coupons_discount_type_enum' }
        ).notNullable().defaultTo('percentage');
        table.decimal('discount_value', 10, 2).notNullable();
        table.decimal('min_order_amount', 10, 2).notNullable().defaultTo(0);
        table.decimal('max_discount', 10, 2).nullable();
        table.date('start_date').notNullable();
        table.date('expiry_date').notNullable();
        table.integer('usage_limit').notNullable().defaultTo(100);
        table.integer('per_user_limit').notNullable().defaultTo(1);
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.unique('code', { indexName: 'coupons_code_unique' });
        table.index('is_active', 'idx_coupon_active');

        table.check('?? >= 0', ['discount_value'], 'chk_coupons_discount_value_nonneg');
        table.check('?? >= 0', ['min_order_amount'], 'chk_coupons_min_order_nonneg');
        table.check(
            '(?? IS NULL OR ?? >= 0)',
            ['max_discount', 'max_discount'],
            'chk_coupons_max_discount_nonneg'
        );
        table.check('?? >= 0', ['usage_limit'], 'chk_coupons_usage_limit_nonneg');
        table.check('?? >= 0', ['per_user_limit'], 'chk_coupons_per_user_limit_nonneg');
        table.check('?? <= ??', ['start_date', 'expiry_date'], 'chk_coupons_dates_order');
    }).then(() => (
        knex.raw(
            'ALTER TABLE `coupons` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('coupons');
};