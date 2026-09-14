/**
 * business_settings & tax_config — Phase 8: configurable business identity
 * and tax rules for invoice generation.
 *
 * business_settings:
 *   A single-row table (id = 1) holding the business identity that appears
 *   on every invoice. Stores the name, address, GSTIN, state, contact
 *   details, and a year-scoped invoice counter for sequential numbering.
 *   The invoice_counter_year column tracks which calendar year the current
 *   counter belongs to — the generation code resets the counter to 1 when
 *   the year rolls over.
 *
 * tax_config:
 *   Configurable tax rates keyed by type ('cgst', 'sgst', 'igst') with
 *   percentage, description, and active flag. Each invoice snapshots the
 *   applicable rates at generation time so future rate changes never
 *   alter historical invoices.
 *
 * IMPORTANT — Business/Accounting Confirmation Required:
 *   The default tax rates below are PLACEHOLDERS. Before going live,
 *   a qualified accountant or tax professional must confirm:
 *   1. Whether the business is GST-registered (if not, GST fields
 *      remain NULL and tax_amount stays 0).
 *   2. The correct CGST + SGST rates (for intra-state) or IGST rate
 *      (for inter-state) that apply to the products sold.
 *   3. Whether any products are GST-exempt or have different HSN-level
 *      rates.
 *   4. Whether the GSTIN shown on the invoice is correct.
 *   5. Whether CGST + SGST vs IGST is determined by seller state vs
 *      customer state (current implementation uses seller_state from
 *      business_settings — verify this matches actual nexus rules).
 *
 *   The system will NOT apply any tax unless the admin explicitly enables
 *   it via the is_enabled flag on the relevant tax_config rows. By
 *   default, all tax rows are created as disabled (is_enabled = 0).
 */
exports.up = function up(knex) {
    return knex.schema
        .createTable('business_settings', (table) => {
            table.integer('id').primary().defaultTo(1)
                .comment('Singleton row — always id = 1.');
            table.string('business_name', 200).notNullable().defaultTo('Mandi Connect');
            table.text('business_address').notNullable().defaultTo('');
            table.string('business_gstin', 20).nullable()
                .comment('NULL = not GST-registered.');
            table.string('business_state', 100).nullable();
            table.string('business_phone', 20).nullable();
            table.string('business_email', 150).nullable();
            table.string('business_website', 200).nullable();

            // Invoice numbering — year-scoped sequential counter.
            table.integer('invoice_counter').unsigned().notNullable().defaultTo(0)
                .comment('Next invoice number for the current year. Reset to 0 on Jan 1.');
            table.integer('invoice_counter_year').unsigned().notNullable()
                .comment('Calendar year the current counter belongs to.');

            table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

            // Singleton constraint — prevents accidental double-inserts.
            table.check('?? = 1', ['id'], 'chk_business_settings_singleton');
        })
        .then(() => knex.raw(
            'ALTER TABLE `business_settings` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ))
        .then(() =>
            knex.schema.createTable('tax_config', (table) => {
                table.increments('id').primary();
                table.enu(
                    'tax_type',
                    ['cgst', 'sgst', 'igst'],
                    { useNative: true, enumName: 'tax_config_type_enum' }
                ).notNullable();
                table.decimal('rate_percent', 6, 2).notNullable().defaultTo(0)
                    .comment('Percentage, e.g. 2.5 for 2.5%.');
                table.string('description', 200).nullable()
                    .comment('Human-readable label, e.g. "CGST @ 2.5%".');
                table.boolean('is_enabled').notNullable().defaultTo(false)
                    .comment('FALSE by default — admin must explicitly enable after confirming rates.');
                table.string('hsn_scope', 50).nullable().defaultTo('all')
                    .comment('Which HSN categories this rate applies to. "all" = blanket rate.');

                table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
                table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

                // One row per tax type — no duplicates.
                table.unique('tax_type', { indexName: 'tax_config_type_unique' });
            })
        )
        .then(() => knex.raw(
            'ALTER TABLE `tax_config` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ));
};

exports.down = function down(knex) {
    return knex.schema
        .dropTableIfExists('tax_config')
        .then(() => knex.schema.dropTableIfExists('business_settings'));
};
