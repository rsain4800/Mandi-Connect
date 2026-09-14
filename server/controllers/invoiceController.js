/**
 * invoiceController — handles viewing, downloading, and searching invoices.
 *
 * Access rules:
 *   - Customer: can view/download their own invoices (owner check via order.user_id).
 *   - Admin: can view/download/search any invoice.
 *
 * PDF download streams the PDF directly to the browser — no file is
 * saved to disk (stateless generation from the immutable invoice row).
 */
'use strict';

const { pool } = require('../config/db');
const { generateInvoicePdf } = require('../utils/pdfInvoice');
const logger = require('../utils/logger');

/**
 * Escape text for safe HTML interpolation (XSS prevention).
 */
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const money = (value) => `Rs. ${parseFloat(value || 0).toFixed(2)}`;

/**
 * GET /api/invoices/:orderId
 * View invoice for an order (HTML page).
 * Access: order owner or admin.
 */
const viewInvoice = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const isNumeric = !isNaN(orderId);
        const whereClause = isNumeric ? 'o.id = ?' : 'o.order_number = ?';

        // Fetch the order and check access
        const [orders] = await pool.query(
            `SELECT o.*, u.full_name as user_name, u.email as user_email, u.phone as user_phone
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE ${whereClause}`,
            [orderId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        const order = orders[0];

        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        // Fetch or generate invoice
        const [invoices] = await pool.query(
            'SELECT * FROM invoices WHERE order_id = ? ORDER BY id ASC LIMIT 1',
            [order.id]
        );

        if (invoices.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not yet generated for this order. Invoices are generated when the order is confirmed.'
            });
        }

        const invoice = invoices[0];
        const lineItems = typeof invoice.line_items === 'string'
            ? JSON.parse(invoice.line_items)
            : (invoice.line_items || []);

        const itemRows = lineItems.map((item) => `
            <tr>
                <td>${escapeHtml(item.product_name)}<div class="sub">SKU: ${escapeHtml(item.sku)}</div></td>
                <td class="num">${item.quantity} ${escapeHtml(item.unit)}</td>
                <td class="num">${money(item.unit_price)}</td>
                <td class="num">${money(item.line_total)}</td>
            </tr>
        `).join('');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Invoice ${escapeHtml(invoice.invoice_number)}</title>
<style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; max-width: 800px; margin: 32px auto; padding: 0 24px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1F4D36; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 22px; font-weight: 800; color: #1F4D36; }
    .brand .tag { font-size: 11px; font-weight: 400; color: #666; display: block; }
    .brand .detail { font-size: 10px; color: #888; margin-top: 4px; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { margin: 0; font-size: 20px; color: #1F4D36; }
    .invoice-title .meta { font-size: 12px; color: #555; margin-top: 4px; }
    .invoice-title .inv-num { font-family: monospace; font-weight: bold; color: #1F4D36; font-size: 14px; }
    .grid { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
    .box { flex: 1; }
    .box h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; }
    .box p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { text-align: left; background: #f4f1e8; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #555; }
    td { padding: 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    .sub { font-size: 11px; color: #888; margin-top: 2px; }
    .totals { width: 280px; margin-left: auto; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { border-top: 2px solid #1F4D36; margin-top: 6px; padding-top: 8px; font-weight: 800; font-size: 15px; color: #1F4D36; }
    .status-row { display: flex; gap: 12px; margin: 20px 0; }
    .pill { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #eef6f0; color: #1F4D36; }
    .pill.pending { background: #fef3c7; color: #92400e; }
    .pill.paid { background: #d1fae5; color: #065f46; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #888; text-align: center; }
    .download-btn { position: fixed; top: 16px; right: 16px; padding: 8px 16px; background: #1F4D36; color: #fff; border: none; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; }
    @media print { .download-btn { display: none; } body { margin: 0 auto; } }
</style>
</head>
<body>
    <a href="/api/invoices/${order.id}/pdf" target="_blank" class="download-btn">Download PDF</a>

    <div class="header">
        <div class="brand">
            ${escapeHtml(invoice.business_name || 'Mandi Connect')}
            ${invoice.business_address ? `<span class="detail">${escapeHtml(invoice.business_address)}</span>` : ''}
            ${invoice.business_gstin ? `<span class="detail">GSTIN: ${escapeHtml(invoice.business_gstin)}</span>` : ''}
            ${invoice.business_state ? `<span class="detail">State: ${escapeHtml(invoice.business_state)}</span>` : ''}
        </div>
        <div class="invoice-title">
            <h1>TAX INVOICE</h1>
            <div class="inv-num">${escapeHtml(invoice.invoice_number)}</div>
            <div class="meta">Date: ${new Date(invoice.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            ${invoice.order_number ? `<div class="meta">Order: #${escapeHtml(invoice.order_number)}</div>` : ''}
        </div>
    </div>

    <div class="grid">
        <div class="box">
            <h4>Billed To</h4>
            <p><strong>${escapeHtml(invoice.customer_name)}</strong></p>
            <p>${escapeHtml(invoice.billing_address)}</p>
            <p>Phone: ${escapeHtml(invoice.customer_phone)}</p>
            ${invoice.customer_email ? `<p>Email: ${escapeHtml(invoice.customer_email)}</p>` : ''}
            ${invoice.customer_gstin ? `<p>GSTIN: ${escapeHtml(invoice.customer_gstin)}</p>` : ''}
        </div>
        <div class="box">
            <h4>Shipped To</h4>
            <p>${escapeHtml(invoice.shipping_address)}</p>
        </div>
    </div>

    <div class="status-row">
        <span class="pill ${invoice.payment_status || 'pending'}">Payment: ${escapeHtml((invoice.payment_status || '').replace('_', ' ').toUpperCase())}</span>
        <span class="pill">${invoice.payment_method ? escapeHtml(invoice.payment_method.toUpperCase()) : 'N/A'}</span>
    </div>

    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th class="num">Qty</th>
                <th class="num">Unit Price</th>
                <th class="num">Amount</th>
            </tr>
        </thead>
        <tbody>
            ${itemRows}
        </tbody>
    </table>

    <div class="totals">
        <div><span>Subtotal</span><span>${money(invoice.subtotal)}</span></div>
        ${parseFloat(invoice.discount_amount) > 0 ? `<div><span>Discount</span><span>-${money(invoice.discount_amount)}</span></div>` : ''}
        <div><span>Shipping</span><span>${parseFloat(invoice.shipping_charge) > 0 ? money(invoice.shipping_charge) : 'FREE'}</span></div>
        ${parseFloat(invoice.tax_amount) > 0 ? `
            <div style="border-top:1px solid #eee;margin-top:4px;padding-top:4px;"><span>Tax Breakdown</span><span></span></div>
            ${parseFloat(invoice.cgst_amount) > 0 ? `<div><span style="padding-left:12px;">CGST</span><span>${money(invoice.cgst_amount)}</span></div>` : ''}
            ${parseFloat(invoice.sgst_amount) > 0 ? `<div><span style="padding-left:12px;">SGST</span><span>${money(invoice.sgst_amount)}</span></div>` : ''}
            ${parseFloat(invoice.igst_amount) > 0 ? `<div><span style="padding-left:12px;">IGST</span><span>${money(invoice.igst_amount)}</span></div>` : ''}
            ${invoice.tax_rate_label ? `<div><span style="padding-left:12px;font-size:11px;color:#888;">(${escapeHtml(invoice.tax_rate_label)})</span><span></span></div>` : ''}
        ` : ''}
        <div class="grand"><span>Grand Total</span><span>${money(invoice.total_amount)}</span></div>
    </div>

    ${invoice.notes ? `<div class="footer">Notes: ${escapeHtml(invoice.notes)}</div>` : ''}

    <div class="footer">
        This is a system-generated invoice (${escapeHtml(invoice.invoice_number)}) and does not require a physical signature.<br />
        For questions about this invoice, contact support with the invoice number above.
        ${invoice.original_invoice_id ? `<br /><em>This is a credit note / correction invoice.</em>` : ''}
    </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (error) {
        logger.error({ err: error }, 'View invoice error');
        return res.status(500).json({ success: false, message: 'Error loading invoice.' });
    }
};

/**
 * GET /api/invoices/:orderId/pdf
 * Download invoice as PDF.
 * Access: order owner or admin.
 */
const downloadInvoicePdf = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const isNumeric = !isNaN(orderId);
        const whereClause = isNumeric ? 'o.id = ?' : 'o.order_number = ?';

        const [orders] = await pool.query(
            `SELECT o.id, o.user_id, o.order_number FROM orders o WHERE ${whereClause}`,
            [orderId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        const order = orders[0];

        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const [invoices] = await pool.query(
            'SELECT * FROM invoices WHERE order_id = ? ORDER BY id ASC LIMIT 1',
            [order.id]
        );

        if (invoices.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not yet generated for this order.'
            });
        }

        const invoice = invoices[0];
        // Inject order_number for the PDF header
        invoice.order_number = order.order_number;

        const pdfBuffer = await generateInvoicePdf(invoice);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Invoice_${invoice.invoice_number}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.send(pdfBuffer);
    } catch (error) {
        logger.error({ err: error }, 'Download invoice PDF error');
        return res.status(500).json({ success: false, message: 'Error generating invoice PDF.' });
    }
};

/**
 * GET /api/invoices/admin/search
 * Search invoices (admin only).
 * Query params: q (invoice number, customer name, email, order number),
 *               status (payment_status), page, limit.
 */
const searchInvoices = async (req, res) => {
    try {
        const { q, status, page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const offset = (pageNum - 1) * limitNum;

        const whereClauses = [];
        const params = [];

        if (q) {
            whereClauses.push(
                '(i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_email LIKE ? OR o.order_number LIKE ?)'
            );
            const term = `%${q}%`;
            params.push(term, term, term, term);
        }

        if (status) {
            whereClauses.push('i.payment_status = ?');
            params.push(status);
        }

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        // Count total matching rows
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total
             FROM invoices i
             LEFT JOIN orders o ON i.order_id = o.id
             ${whereSql}`,
            params
        );
        const total = countResult[0].total;

        // Fetch page
        const [invoices] = await pool.query(
            `SELECT i.*, o.order_number
             FROM invoices i
             LEFT JOIN orders o ON i.order_id = o.id
             ${whereSql}
             ORDER BY i.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limitNum, offset]
        );

        return res.json({
            success: true,
            invoices,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        logger.error({ err: error }, 'Search invoices error');
        return res.status(500).json({ success: false, message: 'Error searching invoices.' });
    }
};

/**
 * GET /api/invoices/admin/all
 * List all invoices (admin only) with pagination.
 */
const getAllInvoices = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const offset = (pageNum - 1) * limitNum;

        const [countResult] = await pool.query('SELECT COUNT(*) as total FROM invoices');
        const total = countResult[0].total;

        const [invoices] = await pool.query(
            `SELECT i.*, o.order_number
             FROM invoices i
             LEFT JOIN orders o ON i.order_id = o.id
             ORDER BY i.created_at DESC
             LIMIT ? OFFSET ?`,
            [limitNum, offset]
        );

        return res.json({
            success: true,
            invoices,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        logger.error({ err: error }, 'Get all invoices error');
        return res.status(500).json({ success: false, message: 'Error fetching invoices.' });
    }
};

module.exports = {
    viewInvoice,
    downloadInvoicePdf,
    searchInvoices,
    getAllInvoices
};
