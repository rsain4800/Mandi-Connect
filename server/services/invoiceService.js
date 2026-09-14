/**
 * invoiceService — core business logic for invoice creation and numbering.
 *
 * Invoice numbering strategy:
 *   Format: MC-INV-YYYY-NNNNNN (e.g. MC-INV-2026-000001)
 *   Uses a year-scoped atomic counter in business_settings, incremented
 *   via SELECT ... FOR UPDATE inside a transaction. This guarantees:
 *     1. No two invoices can ever share the same number (row-level lock).
 *     2. Numbers are sequential (human-readable, auditable).
 *     3. Counter resets each calendar year (short numbers).
 *     4. No reliance on random numbers, UUIDs, or auto-increment IDs.
 *
 * Historical integrity:
 *   Once a row is inserted, it is NEVER updated by application code.
 *   Corrections are issued as new "credit note" invoices referencing
 *   the original via original_invoice_id.
 */
'use strict';

const { pool } = require('../config/db');
const { getBusinessSettings, calculateTax } = require('../config/businessConfig');
const logger = require('../utils/logger');

/**
 * Generate the next unique invoice number. Must be called inside an
 * open transaction/connection that holds a lock on business_settings.
 *
 * @param {object} connection — a mysql2/promise connection with an open transaction
 * @returns {Promise<{ invoiceNumber: string, counter: number }>}
 */
async function generateInvoiceNumber(connection) {
    const year = new Date().getFullYear();

    // Lock the singleton row so no concurrent request can read the same
    // counter value before we increment it.
    const [rows] = await connection.query(
        'SELECT invoice_counter, invoice_counter_year FROM business_settings WHERE id = 1 FOR UPDATE'
    );

    if (rows.length === 0) {
        // Should never happen after migration, but defensive insert.
        await connection.query(
            'INSERT INTO business_settings (id, invoice_counter, invoice_counter_year) VALUES (1, 0, ?) ON DUPLICATE KEY UPDATE id = id',
            [year]
        );
        // Re-read after insert.
        const [retry] = await connection.query(
            'SELECT invoice_counter, invoice_counter_year FROM business_settings WHERE id = 1 FOR UPDATE'
        );
        rows.push(retry[0]);
    }

    let settings = rows[0];

    // Reset counter at year rollover
    if (settings.invoice_counter_year !== year) {
        await connection.query(
            'UPDATE business_settings SET invoice_counter = 0, invoice_counter_year = ? WHERE id = 1',
            [year]
        );
        settings = { invoice_counter: 0, invoice_counter_year: year };
    }

    const nextCounter = settings.invoice_counter + 1;
    await connection.query(
        'UPDATE business_settings SET invoice_counter = ? WHERE id = 1',
        [nextCounter]
    );

    const invoiceNumber = `MC-INV-${year}-${String(nextCounter).padStart(6, '0')}`;
    return { invoiceNumber, counter: nextCounter };
}

/**
 * Finalize an invoice for an order. This is called once per order —
 * either immediately at order creation (COD) or upon payment capture
 * (online). If an invoice already exists for this order, returns the
 * existing one (idempotent).
 *
 * @param {object} connection — open transaction connection
 * @param {object} params
 * @param {number} params.orderId
 * @param {object} params.order — full order row
 * @param {object} params.items — order_items rows
 * @param {string} [params.createdBy] — who triggered this (for audit)
 * @returns {Promise<object>} — the finalized invoice row
 */
async function finalizeInvoice(connection, { orderId, order, items, createdBy = 'System' }) {
    // Idempotent: if an invoice already exists for this order, return it.
    const [existing] = await connection.query(
        'SELECT * FROM invoices WHERE order_id = ? ORDER BY id ASC LIMIT 1',
        [orderId]
    );
    if (existing.length > 0) {
        return existing[0];
    }

    // Load business settings
    const business = await getBusinessSettings();

    // Calculate tax
    const discountAmount = parseFloat(order.discount_amount || 0);
    const shippingCharge = parseFloat(order.shipping_charge || 0);
    const subtotal = parseFloat(order.subtotal || 0);
    const taxableAmount = Math.max(0, subtotal - discountAmount + shippingCharge);
    const tax = await calculateTax(taxableAmount);

    // Build line items snapshot
    const lineItems = items.map((item) => ({
        product_name: item.product_name,
        sku: item.sku,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: parseFloat(item.price),
        discount: 0, // Per-item discount is not supported in current order model
        line_total: parseFloat(item.total_price)
    }));

    // Compute grand total
    const totalAmount = Math.round((taxableAmount + tax.tax_amount) * 100) / 100;

    // Generate unique invoice number
    const { invoiceNumber } = await generateInvoiceNumber(connection);

    // Insert invoice
    const [result] = await connection.query(
        `INSERT INTO invoices (
            invoice_number, order_id, business_name, business_address,
            business_gstin, business_state,
            customer_name, customer_email, customer_phone, customer_gstin,
            billing_address, shipping_address,
            subtotal, discount_amount, shipping_charge, taxable_amount,
            cgst_amount, sgst_amount, igst_amount, tax_amount, tax_rate_label, total_amount,
            payment_status, payment_method, line_items, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            invoiceNumber, orderId,
            business.business_name, business.business_address,
            business.business_gstin, business.business_state,
            order.user_name || order.shipping_full_name || '',
            order.user_email || null,
            order.shipping_phone || null,
            order.customer_gstin || null, // may not exist on order row
            order.shipping_address_text, // billing = shipping (same address for e-commerce)
            order.shipping_address_text,
            subtotal, discountAmount, shippingCharge, taxableAmount,
            tax.cgst_amount, tax.sgst_amount, tax.igst_amount,
            tax.tax_amount, tax.tax_rate_label, totalAmount,
            order.payment_status || 'pending',
            order.payment_method || 'cod',
            JSON.stringify(lineItems),
            null
        ]
    );

    logger.info({ invoiceId: result.insertId, invoiceNumber, orderId, createdBy }, 'Invoice finalized');

    // Return the newly created invoice
    const [invoices] = await connection.query('SELECT * FROM invoices WHERE id = ?', [result.insertId]);
    return invoices[0];
}

/**
 * Create a credit note / cancellation invoice that references the original.
 *
 * @param {object} connection — open transaction connection
 * @param {object} params
 * @param {number} params.originalInvoiceId
 * @param {string} params.reason
 * @returns {Promise<object>}
 */
async function createCreditNote(connection, { originalInvoiceId, reason }) {
    const [originalRows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [originalInvoiceId]);
    if (originalRows.length === 0) {
        throw new Error('Original invoice not found.');
    }
    const original = originalRows[0];
    const lineItems = JSON.parse(original.line_items || '[]');

    const { invoiceNumber } = await generateInvoiceNumber(connection);

    const [result] = await connection.query(
        `INSERT INTO invoices (
            invoice_number, order_id, original_invoice_id,
            business_name, business_address, business_gstin, business_state,
            customer_name, customer_email, customer_phone, customer_gstin,
            billing_address, shipping_address,
            subtotal, discount_amount, shipping_charge, taxable_amount,
            cgst_amount, sgst_amount, igst_amount, tax_amount, tax_rate_label, total_amount,
            payment_status, payment_method, line_items, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            invoiceNumber, original.order_id, originalInvoiceId,
            original.business_name, original.business_address,
            original.business_gstin, original.business_state,
            original.customer_name, original.customer_email, original.customer_phone, original.customer_gstin,
            original.billing_address, original.shipping_address,
            // Negate amounts for credit note
            -original.subtotal, -original.discount_amount, -original.shipping_charge, -original.taxable_amount,
            -original.cgst_amount, -original.sgst_amount, -original.igst_amount,
            -original.tax_amount, original.tax_rate_label, -original.total_amount,
            'paid', original.payment_method, JSON.stringify(lineItems),
            `Credit Note — ${reason}`
        ]
    );

    const [invoices] = await connection.query('SELECT * FROM invoices WHERE id = ?', [result.insertId]);
    return invoices[0];
}

/**
 * Fetch the invoice for a given order, or null if not yet generated.
 */
async function getInvoiceForOrder(orderId) {
    const [rows] = await pool.query(
        'SELECT * FROM invoices WHERE order_id = ? ORDER BY id ASC LIMIT 1',
        [orderId]
    );
    return rows.length > 0 ? rows[0] : null;
}

module.exports = {
    generateInvoiceNumber,
    finalizeInvoice,
    createCreditNote,
    getInvoiceForOrder
};
