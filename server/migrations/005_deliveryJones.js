/**
 * delivery_zones — Phase 1 audit finding: same situation as
 * rajasthan_districts (used throughout zoneController.js /
 * rajasthanValidation.js, never migrated). A zone defines the base shipping
 * charge and delivery-time window for the districts/pincodes mapped to it.
 * No delete endpoint exists (add/update/toggle only), so referencing rows
 * (serviceable_pincodes) use a RESTRICT FK rather than CASCADE.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('delivery_zones', (table) => {
        table.increments('id').primary();
        table.string('name', 100).notNullable();
        table.decimal('shipping_charge', 10, 2).notNullable().defaultTo(0);
        table.integer('estimated_delivery_days_min').notNullable().defaultTo(1);
        table.integer('estimated_delivery_days_max').notNullable().defaultTo(3);
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.unique('name', { indexName: 'delivery_zones_name_unique' });
        table.index('is_active', 'idx_zone_active');

        table.check('?? >= 0', ['shipping_charge'], 'chk_zones_shipping_charge_nonneg');
        table.check('?? >= 0', ['estimated_delivery_days_min'], 'chk_zones_days_min_nonneg');
        table.check(
            '?? >= ??',
            ['estimated_delivery_days_max', 'estimated_delivery_days_min'],
            'chk_zones_days_max_gte_min'
        );
    }).then(() => (
        knex.raw(
            'ALTER TABLE `delivery_zones` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('delivery_zones');
};