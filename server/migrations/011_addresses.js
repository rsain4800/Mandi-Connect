/**
 * addresses — Phase 1 audit finding: schema.sql's `addresses` table was
 * missing five columns that addressController.js reads and writes on
 * every request: business_name, alternate_phone, district, gstin, and
 * serviceable_pincode_id. Every add/update-address call would have failed
 * with ER_BAD_FIELD_ERROR against the old schema. Rebuilt here to match
 * the controller exactly:
 *   - `district` is a denormalized text snapshot of the resolved district
 *     name at save time (locationCheck.district.name), separate from...
 *   - `serviceable_pincode_id`, the FK to the actual serviceable_pincodes
 *     row used for delivery-zone lookups.
 *   - `gstin` supports wholesale/business buyers who need it on invoices.
 *
 * serviceable_pincode_id uses ON DELETE SET NULL rather than RESTRICT:
 * zoneController.adminDeletePincode currently does a hard DELETE (a
 * pre-existing inconsistency with this business's "never hard-delete
 * business records" rule, flagged separately in PHASE1_DB_AUDIT.md) — SET
 * NULL means an admin removing a pincode from the serviceable list can
 * never accidentally destroy a customer's saved address as a side effect.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('addresses', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.string('full_name', 100).notNullable();
        table.string('business_name', 150).nullable();
        table.string('phone', 20).notNullable();
        table.string('alternate_phone', 20).nullable();
        table.string('house_building', 150).notNullable();
        table.string('street', 150).notNullable();
        table.string('area', 150).notNullable();
        table.string('city', 100).notNullable();
        table.string('district', 100).nullable();
        table.string('state', 100).notNullable();
        table.string('pincode', 10).notNullable();
        table.string('landmark', 150).nullable();
        table.string('gstin', 15).nullable();
        table.integer('serviceable_pincode_id').unsigned().nullable();
        table.enu(
            'address_type',
            ['home', 'work', 'other'],
            { useNative: true, enumName: 'addresses_type_enum' }
        ).notNullable().defaultTo('home');
        table.boolean('is_default').notNullable().defaultTo(false);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.index('user_id', 'idx_addresses_user');
        table.index('pincode', 'idx_addresses_pincode');
        table.index('serviceable_pincode_id', 'idx_addresses_pincode_ref');

        table.foreign('user_id', 'fk_addresses_user')
            .references('id').inTable('users')
            .onDelete('CASCADE')
            .onUpdate('CASCADE');
        table.foreign('serviceable_pincode_id', 'fk_addresses_pincode')
            .references('id').inTable('serviceable_pincodes')
            .onDelete('SET NULL')
            .onUpdate('CASCADE');
    }).then(() => (
        knex.raw(
            'ALTER TABLE `addresses` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('addresses');
};