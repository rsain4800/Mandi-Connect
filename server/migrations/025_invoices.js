/**
 * invoices — Phase 8: production-grade business records for completed orders.
 *
 * Each row is a finalized, immutable snapshot of an order's billing state at
 * the moment of generation. Once created, the invoice row is NEVER updated by
 * normal application flow — corrections are handled by issuing a new
 * credit/debit note invoice that references the original.
 *
 * Invoice numbering:
 *   MC-INV-YYYY-NNNNNN (e.g. MC-INV-2026-000001)
 *   Generated from a row-level counter in business_settings that is
 *   incremented atomically inside a transaction (SELECT ... FOR UPDATE),
 *   guaranteeing uniqueness even under heavy concurrent checkout load.
 *   The counter is year-scoped — it resets to 1 each January, so
 *   invoice numbers are short, human-readable, and still globally unique.
 *
 * Historical integrity:
 *   order_id uses RESTRICT (not CASCADE) — deleting an order must never
 *   silently remove its invoices. The only way to "correct" an invoice is
 *   to issue a new one (credit note or replacement) linked via
 *   `original_invoice_id`.
 *
 * GST fields are stored as snapshots so the invoice is self-contained:
 *   even if tax rates change in the future, the invoice reflects the
 *   rules that applied at the time of generation.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('invoices', (table) => {
        table.increments('id').primary();
        table.string('invoice_number', 30).notNullable();
        table.integer('order_id').unsigned().notNullable();
        table.integer('original_invoice_id').unsigned().nullable()
            .comment('References the invoice this one corrects (credit note / replacement).');

        // Business snapshot — frozen at generation time so the invoice is
        // self-contained and immune to future business-info changes.
        table.string('business_name', 200).notNullable();
        table.text('business_address').notNullable();
        table.string('business_gstin', 20).nullable()
            .comment('GST Identification Number — NULL when GST does not apply.');
        table.string('business_state', 100).nullable();

        // Customer snapshot — copied from orders + users at generation time.
        table.string('customer_name', 100).notNullable();
        table.string('customer_email', 150).nullable();
        table.string('customer_phone', 20).nullable();
        table.string('customer_gstin', 20).nullable()
            .comment('B2B: customer GSTIN if registered. NULL for B2C.');
        table.text('billing_address').notNullable();
        table.text('shipping_address').notNullable();

        // Financial snapshot — computed at generation time, never recomputed.
        table.decimal('subtotal', 12, 2).notNullable()
            .comment('Sum of (price × quantity) for all line items before tax.');
        table.decimal('discount_amount', 12, 2).notNullable().defaultTo(0);
        table.decimal('shipping_charge', 12, 2).notNullable().defaultTo(0);
        table.decimal('taxable_amount', 12, 2).notNullable().defaultTo(0)
            .comment('Subtotal - discount + shipping (the base on which tax is computed).');
        table.decimal('cgst_amount', 10, 2).notNullable().defaultTo(0)
            .comment('Central GST component.');
        table.decimal('sgst_amount', 10, 2).notNullable().defaultTo(0)
            .comment('State GST component (or IGST equivalent).');
        table.decimal('igst_amount', 10, 2).notNullable().defaultTo(0)
            .comment('Integrated GST — used for inter-state supplies.');
        table.decimal('tax_amount', 10, 2).notNullable().defaultTo(0)
            .comment('Total tax (cgst + sgst + igst).');
        table.string('tax_rate_label', 50).nullable()
            .comment('Human-readable rate, e.g. "5% GST", "12% IGST".');
        table.decimal('total_amount', 12, 2).notNullable()
            .comment('Taxable amount + tax — the grand total the customer pays.');

        // Payment snapshot
        table.enu(
            'payment_status',
            ['pending', 'paid', 'failed', 'partially_refunded', 'refunded', 'cancelled'],
            { useNative: true, enumName: 'invoices_payment_status_enum' }
        ).notNullable().defaultTo('pending');
        table.string('payment_method', 30).nullable();

        // Line items stored as JSON — avoids a separate table while keeping
        // the invoice fully self-contained. Schema per item:
        //   { product_name, sku, unit, quantity, unit_price, discount, line_total }
        // Stored as JSON text because Knex's MySQL dialect doesn't have a
        // native JSON column helper that's cross-version safe.
        table.text('line_items').notNullable()
            .comment('JSON array of invoice line items — immutable snapshot.');

        table.text('notes').nullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.unique('invoice_number', { indexName: 'idx_invoice_number' });
        table.index('order_id', 'idx_invoices_order');
        table.index('customer_email', 'idx_invoices_customer_email');
        table.index('created_at', 'idx_invoices_created_at');
        table.index('payment_status', 'idx_invoices_payment_status');

        table.foreign('order_id', 'fk_invoices_order')
            .references('id').inTable('orders')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');
        table.foreign('original_invoice_id', 'fk_invoices_original')
            .references('id').inTable('invoices')
            .onDelete('SET NULL')
            .onUpdate('CASCADE');

        table.check('?? >= 0', ['subtotal'], 'chk_invoices_subtotal_nonneg');
        table.check('?? >= 0', ['discount_amount'], 'chk_invoices_discount_nonneg');
        table.check('?? >= 0', ['shipping_charge'], 'chk_invoices_shipping_nonneg');
        table.check('?? >= 0', ['tax_amount'], 'chk_invoices_tax_nonneg');
        table.check('?? >= 0', ['total_amount'], 'chk_invoices_total_nonneg');
    });
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('invoices');
};
