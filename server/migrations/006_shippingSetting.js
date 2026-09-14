/**
 * shipping_settings — single-row config table (id is always 1;
 * shippingController reads/writes `WHERE id = 1` /
 * `INSERT ... VALUES (1, ...) ON DUPLICATE KEY UPDATE`). The primary key
 * itself already prevents a second row, so no extra constraint is needed
 * beyond seeding row id=1.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('shipping_settings', (table) => {
        table.increments('id').primary();
        table.decimal('shipping_charge', 10, 2).notNullable().defaultTo(40.00);
        table.decimal('free_shipping_threshold', 10, 2).notNullable().defaultTo(500.00);
        table.integer('estimated_delivery_days').notNullable().defaultTo(2);
        table.boolean('cod_enabled').notNullable().defaultTo(true);
        table.text('delivery_areas').nullable();
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.check('?? >= 0', ['shipping_charge'], 'chk_shipping_charge_nonneg');
        table.check('?? >= 0', ['free_shipping_threshold'], 'chk_shipping_threshold_nonneg');
        table.check('?? >= 0', ['estimated_delivery_days'], 'chk_shipping_days_nonneg');
    }).then(() => (
        knex.raw(
            'ALTER TABLE `shipping_settings` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('shipping_settings');
};