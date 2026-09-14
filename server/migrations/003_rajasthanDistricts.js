/**
 * rajasthan_districts — Phase 1 audit finding: zoneController.js and
 * rajasthanValidation.js both query this table extensively (checkPincode,
 * getDistricts, adminAddDistrict, validateDeliveryLocation, ...), but it
 * did not exist in schema.sql and had no migration at all — every one of
 * those queries would fail with ER_NO_SUCH_TABLE against a freshly
 * migrated database. Added here to match actual application usage.
 *
 * No delete endpoint exists for districts (only add + toggle is_active),
 * consistent with "never hard-delete reference data that other rows may
 * point to" — see serviceable_pincodes' RESTRICT FK to this table.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('rajasthan_districts', (table) => {
        table.increments('id').primary();
        table.string('name', 100).notNullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.unique('name', { indexName: 'rajasthan_districts_name_unique' });
        table.index('is_active', 'idx_district_active');
    });
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('rajasthan_districts');
};