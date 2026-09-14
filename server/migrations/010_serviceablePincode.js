/**
 * serviceable_pincodes — Phase 1 audit finding: same situation as the other
 * two zone tables (used throughout zoneController.js /
 * rajasthanValidation.js, never migrated). Each row maps one 6-digit
 * pincode to a district + delivery zone, with optional per-pincode
 * overrides for shipping charge / minimum order amount.
 *
 * district_id / delivery_zone_id use RESTRICT rather than CASCADE: a
 * district or zone must not be deletable while pincodes still reference it
 * (in practice this is moot today since neither has a delete endpoint, but
 * it is the correct defensive default per the Phase 1 FK audit).
 *
 * `pincode` is UNIQUE — Phase 1 Step 7 explicitly calls for a unique
 * pincode mapping constraint, and it also matches the ER_DUP_ENTRY handling
 * already written in zoneController.adminAddPincode.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('serviceable_pincodes', (table) => {
        table.increments('id').primary();
        table.string('pincode', 6).notNullable();
        table.string('city_town', 150).notNullable();
        table.integer('district_id').unsigned().notNullable();
        table.integer('delivery_zone_id').unsigned().notNullable();
        table.decimal('delivery_charge_override', 10, 2).nullable();
        table.decimal('min_order_override', 10, 2).nullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.unique('pincode', { indexName: 'serviceable_pincodes_pincode_unique' });
        table.index('district_id', 'idx_pincode_district');
        table.index('delivery_zone_id', 'idx_pincode_zone');
        table.index('is_active', 'idx_pincode_active');

        table.foreign('district_id', 'fk_pincodes_district')
            .references('id').inTable('rajasthan_districts')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');
        table.foreign('delivery_zone_id', 'fk_pincodes_zone')
            .references('id').inTable('delivery_zones')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');

        table.check(
            '?? REGEXP \'^[0-9]{6}$\'',
            ['pincode'],
            'chk_pincodes_pincode_format'
        );
        table.check(
            '(?? IS NULL OR ?? >= 0)',
            ['delivery_charge_override', 'delivery_charge_override'],
            'chk_pincodes_charge_override_nonneg'
        );
        table.check(
            '(?? IS NULL OR ?? >= 0)',
            ['min_order_override', 'min_order_override'],
            'chk_pincodes_min_order_override_nonneg'
        );
    }).then(() => (
        knex.raw(
            'ALTER TABLE `serviceable_pincodes` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('serviceable_pincodes');
};