/**
 * businessConfig — singleton helpers for reading business_settings and
 * tax_config rows from the database. The results are NOT cached in memory
 * because settings can be changed by the admin at any time, and stale
 * cache would produce invoices with outdated business info or tax rates.
 *
 * Every call hits the DB, but these tables are tiny (1 row + 3 rows)
 * and only queried during order creation / invoice generation — not on
 * every request.
 */
'use strict';

const { pool } = require('../config/db');

/**
 * Fetch the singleton business_settings row (id = 1). Returns a plain
 * object with all business identity fields plus the current invoice
 * counter state.
 */
async function getBusinessSettings() {
    const [rows] = await pool.query('SELECT * FROM business_settings WHERE id = 1');
    if (rows.length === 0) {
        // Graceful fallback — should only happen before the first admin
        // visits the settings page. The migration seeds sensible defaults.
        return {
            id: 1,
            business_name: 'Mandi Connect',
            business_address: '',
            business_gstin: null,
            business_state: null,
            business_phone: null,
            business_email: null,
            business_website: null,
            invoice_counter: 0,
            invoice_counter_year: new Date().getFullYear()
        };
    }
    return rows[0];
}

/**
 * Fetch all active tax_config rows. Returns an array of objects:
 *   [{ tax_type, rate_percent, description, is_enabled }, ...]
 */
async function getActiveTaxConfig() {
    const [rows] = await pool.query(
        'SELECT tax_type, rate_percent, description, is_enabled FROM tax_config WHERE is_enabled = 1'
    );
    return rows;
}

/**
 * Calculate tax breakdown for a given taxable amount, using the current
 * active tax configuration.
 *
 * Returns:
 *   { cgst_amount, sgst_amount, igst_amount, tax_amount, tax_rate_label }
 *
 * If no tax config is active (all rates disabled or no rows), returns
 * zeros — the system does NOT invent tax rules.
 */
async function calculateTax(taxableAmount) {
    const taxRows = await getActiveTaxConfig();
    if (taxRows.length === 0) {
        return { cgst_amount: 0, sgst_amount: 0, igst_amount: 0, tax_amount: 0, tax_rate_label: null };
    }

    let cgst_amount = 0;
    let sgst_amount = 0;
    let igst_amount = 0;
    const labels = [];

    for (const row of taxRows) {
        const amount = parseFloat(taxableAmount) * (row.rate_percent / 100);
        // Round to 2 decimal places
        const rounded = Math.round(amount * 100) / 100;

        switch (row.tax_type) {
            case 'cgst':
                cgst_amount += rounded;
                break;
            case 'sgst':
                sgst_amount += rounded;
                break;
            case 'igst':
                igst_amount += rounded;
                break;
        }
        if (row.description) labels.push(row.description);
    }

    const tax_amount = Math.round((cgst_amount + sgst_amount + igst_amount) * 100) / 100;

    return {
        cgst_amount: Math.round(cgst_amount * 100) / 100,
        sgst_amount: Math.round(sgst_amount * 100) / 100,
        igst_amount: Math.round(igst_amount * 100) / 100,
        tax_amount,
        tax_rate_label: labels.length > 0 ? labels.join(' + ') : null
    };
}

module.exports = {
    getBusinessSettings,
    getActiveTaxConfig,
    calculateTax
};
