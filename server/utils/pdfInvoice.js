/**
 * pdfInvoice — generates a professional invoice PDF using PDFKit.
 *
 * The layout follows standard Indian tax invoice conventions:
 *   - Business header with GSTIN
 *   - Invoice metadata (number, date)
 *   - Customer/billing/shipping details
 *   - Line items table with quantity, unit price, discount, amount
 *   - Tax breakdown (CGST/SGST/IGST)
 *   - Grand total
 *   - Payment status
 *   - Footer disclaimer
 *
 * Returns a Buffer — the caller decides whether to stream it to the
 * browser (res.send) or save it to disk.
 */
'use strict';

const PDFDocument = require('pdfkit');

const BRAND_COLOR = '#1F4D36';
const BRAND_LIGHT = '#E4EEE7';
const TEXT_COLOR = '#1a1a1a';
const MUTED_COLOR = '#666666';
const BORDER_COLOR = '#dddddd';

/**
 * Format a number as Indian Rupees.
 */
const formatMoney = (value) => {
    const num = parseFloat(value || 0);
    return `Rs. ${num.toFixed(2)}`;
};

/**
 * Generate a PDF invoice from an invoice record.
 *
 * @param {object} invoice — a row from the `invoices` table
 * @returns {Promise<Buffer>} — the PDF as a Buffer
 */
async function generateInvoicePdf(invoice) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 40,
            bufferPages: true,
            info: {
                Title: `Invoice ${invoice.invoice_number}`,
                Author: invoice.business_name || 'Mandi Connect',
                Subject: `Invoice for Order ${invoice.order_number || invoice.order_id}`,
                Creator: 'Mandi Connect Invoice System'
            }
        });

        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - 80; // 40 margin each side
        const colWidth = pageWidth;

        let y = 40;

        // ─── Business Header ───────────────────────────────────────────
        doc.fontSize(20).fillColor(BRAND_COLOR).font('Helvetica-Bold')
            .text(invoice.business_name || 'Mandi Connect', 40, y);
        y += 28;

        if (invoice.business_address) {
            doc.fontSize(8).fillColor(MUTED_COLOR).font('Helvetica')
                .text(invoice.business_address, 40, y, { width: 300 });
            y += doc.heightOfString(invoice.business_address, { width: 300 }) + 4;
        }

        if (invoice.business_gstin) {
            doc.fontSize(8).fillColor(TEXT_COLOR).font('Helvetica')
                .text(`GSTIN: ${invoice.business_gstin}`, 40, y);
            y += 14;
        }
        if (invoice.business_state) {
            doc.fontSize(8).fillColor(MUTED_COLOR).font('Helvetica')
                .text(`State: ${invoice.business_state}`, 40, y);
            y += 14;
        }
        if (invoice.business_phone) {
            doc.fontSize(8).fillColor(MUTED_COLOR).font('Helvetica')
                .text(`Phone: ${invoice.business_phone}`, 40, y);
            y += 14;
        }
        if (invoice.business_email) {
            doc.fontSize(8).fillColor(MUTED_COLOR).font('Helvetica')
                .text(`Email: ${invoice.business_email}`, 40, y);
            y += 14;
        }

        // ─── Invoice Title & Meta (right side) ─────────────────────────
        const rightX = 40 + pageWidth - 160;
        let rightY = 40;

        doc.fontSize(18).fillColor(BRAND_COLOR).font('Helvetica-Bold')
            .text('TAX INVOICE', rightX, rightY, { width: 160, align: 'right' });
        rightY += 24;

        doc.fontSize(9).fillColor(TEXT_COLOR).font('Helvetica')
            .text(`Invoice #: ${invoice.invoice_number}`, rightX, rightY, { width: 160, align: 'right' });
        rightY += 14;

        const invoiceDate = invoice.created_at
            ? new Date(invoice.created_at).toLocaleDateString('en-IN', {
                year: 'numeric', month: 'long', day: 'numeric'
            })
            : new Date().toLocaleDateString('en-IN', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        doc.text(`Date: ${invoiceDate}`, rightX, rightY, { width: 160, align: 'right' });
        rightY += 14;

        if (invoice.order_number) {
            doc.text(`Order #: ${invoice.order_number}`, rightX, rightY, { width: 160, align: 'right' });
            rightY += 14;
        }

        // ─── Horizontal Line ───────────────────────────────────────────
        y = Math.max(y, rightY) + 12;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
        y += 12;

        // ─── Customer Details (Bill To / Ship To) ──────────────────────
        const colHalf = pageWidth / 2 - 10;

        // Bill To
        doc.fontSize(8).fillColor(MUTED_COLOR).font('Helvetica-Bold')
            .text('BILL TO', 40, y);
        y += 12;
        doc.fontSize(9).fillColor(TEXT_COLOR).font('Helvetica-Bold')
            .text(invoice.customer_name || 'N/A', 40, y);
        y += 13;
        doc.fontSize(8).font('Helvetica').fillColor(TEXT_COLOR);
        if (invoice.customer_email) {
            doc.text(invoice.customer_email, 40, y);
            y += 12;
        }
        if (invoice.customer_phone) {
            doc.text(`Phone: ${invoice.customer_phone}`, 40, y);
            y += 12;
        }
        if (invoice.customer_gstin) {
            doc.text(`GSTIN: ${invoice.customer_gstin}`, 40, y);
            y += 12;
        }
        doc.text(invoice.billing_address || '', 40, y, { width: colHalf });
        y += doc.heightOfString(invoice.billing_address || '', { width: colHalf }) + 8;

        // Ship To (right column)
        const shipX = 40 + colHalf + 20;
        let shipY = y - doc.heightOfString(invoice.billing_address || '', { width: colHalf }) - 8 - 12 * 3 - 13 - 12;
        if (invoice.customer_email) shipY -= 12;
        if (invoice.customer_phone) shipY -= 12;
        if (invoice.customer_gstin) shipY -= 12;
        shipY -= 24; // account for "BILL TO" header + gap

        doc.fontSize(8).fillColor(MUTED_COLOR).font('Helvetica-Bold')
            .text('SHIP TO', shipX, shipY);
        shipY += 12;
        doc.fontSize(8).fillColor(TEXT_COLOR).font('Helvetica')
            .text(invoice.shipping_address || invoice.billing_address || '', shipX, shipY, { width: colHalf });

        // Advance y past both columns
        const billBottom = y;
        const shipBottom = shipY + doc.heightOfString(invoice.shipping_address || invoice.billing_address || '', { width: colHalf });
        y = Math.max(billBottom, shipBottom) + 16;

        // ─── Horizontal Line ───────────────────────────────────────────
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
        y += 12;

        // ─── Line Items Table ──────────────────────────────────────────
        const lineItems = typeof invoice.line_items === 'string'
            ? JSON.parse(invoice.line_items)
            : (invoice.line_items || []);

        // Table header
        const tableTop = y;
        const cols = {
            item: 40,
            sku: 220,
            qty: 310,
            unitPrice: 360,
            amount: 440
        };

        doc.fontSize(7).fillColor(MUTED_COLOR).font('Helvetica-Bold');
        doc.text('ITEM', cols.item, y, { width: cols.sku - cols.item });
        doc.text('SKU', cols.sku, y, { width: cols.qty - cols.sku });
        doc.text('QTY', cols.qty, y, { width: cols.unitPrice - cols.qty, align: 'right' });
        doc.text('UNIT PRICE', cols.unitPrice, y, { width: cols.amount - cols.unitPrice, align: 'right' });
        doc.text('AMOUNT', cols.amount, y, { width: 100, align: 'right' });

        y += 16;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
        y += 4;

        // Table rows
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_COLOR);
        for (const item of lineItems) {
            // Check if we need a new page
            if (y > doc.page.height - 120) {
                doc.addPage();
                y = 40;
            }

            const itemText = `${item.product_name || ''}${item.unit ? ` (${item.unit})` : ''}`;
            doc.text(itemText, cols.item, y, { width: cols.sku - cols.item });
            doc.text(item.sku || '', cols.sku, y, { width: cols.qty - cols.sku });
            doc.text(`${item.quantity}`, cols.qty, y, { width: cols.unitPrice - cols.qty, align: 'right' });
            doc.text(formatMoney(item.unit_price), cols.unitPrice, y, { width: cols.amount - cols.unitPrice, align: 'right' });
            doc.text(formatMoney(item.line_total), cols.amount, y, { width: 100, align: 'right' });

            y += 14;
            doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor('#f0f0f0').lineWidth(0.3).stroke();
            y += 4;
        }

        y += 8;

        // ─── Totals Section (right-aligned) ────────────────────────────
        const totalsX = 340;
        const totalsValueX = 440;
        const totalsWidth = 100;

        const drawTotalRow = (label, value, bold = false, color = TEXT_COLOR) => {
            if (bold) {
                doc.fontSize(9).font('Helvetica-Bold');
            } else {
                doc.fontSize(8).font('Helvetica');
            }
            doc.fillColor(color).text(label, totalsX, y, { width: totalsValueX - totalsX, align: 'right' });
            doc.text(formatMoney(value), totalsValueX, y, { width: totalsWidth, align: 'right' });
            y += 14;
        };

        drawTotalRow('Subtotal', invoice.subtotal);
        if (parseFloat(invoice.discount_amount || 0) > 0) {
            drawTotalRow('Discount', -invoice.discount_amount, false, '#16a34a');
        }
        drawTotalRow('Shipping', invoice.shipping_charge);

        if (parseFloat(invoice.tax_amount || 0) > 0) {
            y += 4;
            if (parseFloat(invoice.cgst_amount || 0) > 0) {
                drawTotalRow('CGST', invoice.cgst_amount);
            }
            if (parseFloat(invoice.sgst_amount || 0) > 0) {
                drawTotalRow('SGST', invoice.sgst_amount);
            }
            if (parseFloat(invoice.igst_amount || 0) > 0) {
                drawTotalRow('IGST', invoice.igst_amount);
            }
            if (invoice.tax_rate_label) {
                doc.fontSize(7).fillColor(MUTED_COLOR).font('Helvetica')
                    .text(`(${invoice.tax_rate_label})`, totalsX, y - 4, { width: totalsValueX - totalsX, align: 'right' });
                y += 8;
            }
        }

        // Grand Total
        y += 4;
        doc.moveTo(totalsX, y).lineTo(totalsX + (totalsValueX - totalsX) + totalsWidth, y)
            .strokeColor(BRAND_COLOR).lineWidth(1).stroke();
        y += 6;

        doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_COLOR)
            .text('GRAND TOTAL', totalsX, y, { width: totalsValueX - totalsX, align: 'right' });
        doc.text(formatMoney(invoice.total_amount), totalsValueX, y, { width: totalsWidth, align: 'right' });
        y += 20;

        // ─── Payment Status ────────────────────────────────────────────
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
        y += 10;

        doc.fontSize(8).font('Helvetica').fillColor(TEXT_COLOR)
            .text(`Payment Method: ${(invoice.payment_method || '').toUpperCase()}`, 40, y);
        y += 12;

        const paymentStatusColor = invoice.payment_status === 'paid' ? '#16a34a'
            : invoice.payment_status === 'failed' ? '#dc2626'
            : invoice.payment_status === 'refunded' ? '#0d9488'
            : '#d97706';
        doc.fontSize(8).font('Helvetica-Bold').fillColor(paymentStatusColor)
            .text(`Payment Status: ${(invoice.payment_status || '').toUpperCase()}`, 40, y);
        y += 20;

        // ─── Notes ─────────────────────────────────────────────────────
        if (invoice.notes) {
            doc.fontSize(7).font('Helvetica').fillColor(MUTED_COLOR)
                .text(`Notes: ${invoice.notes}`, 40, y, { width: pageWidth });
            y += doc.heightOfString(invoice.notes, { width: pageWidth }) + 12;
        }

        // ─── Footer ────────────────────────────────────────────────────
        const footerY = doc.page.height - 60;
        doc.moveTo(40, footerY - 8).lineTo(40 + pageWidth, footerY - 8)
            .strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();

        doc.fontSize(7).font('Helvetica').fillColor(MUTED_COLOR)
            .text(
                `This is a system-generated invoice for ${invoice.invoice_number} and does not require a physical signature.`,
                40, footerY,
                { width: pageWidth, align: 'center' }
            );

        if (invoice.business_website) {
            doc.text(invoice.business_website, 40, footerY + 10, { width: pageWidth, align: 'center' });
        }

        doc.end();
    });
}

module.exports = { generateInvoicePdf };
