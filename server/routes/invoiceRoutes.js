/**
 * invoiceRoutes — customer and admin invoice endpoints.
 *
 * All routes require authentication (verifyToken).
 * Admin-only routes additionally require the requireAdmin middleware.
 *
 * Route map:
 *   GET /api/invoices/admin/all          — list all invoices (admin)
 *   GET /api/invoices/admin/search       — search invoices (admin)
 *   GET /api/invoices/:orderId           — view invoice HTML (owner or admin)
 *   GET /api/invoices/:orderId/pdf       — download invoice PDF (owner or admin)
 */
'use strict';

const express = require('express');
const router = express.Router();
const {
    viewInvoice,
    downloadInvoicePdf,
    searchInvoices,
    getAllInvoices
} = require('../controllers/invoiceController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.use(verifyToken);

// Admin-only routes — placed before the /:orderId catch-all
router.get('/admin/all', requireAdmin, getAllInvoices);
router.get('/admin/search', requireAdmin, searchInvoices);

// Owner or admin: view invoice (HTML) and download PDF
router.get('/:orderId/pdf', downloadInvoicePdf);
router.get('/:orderId', viewInvoice);

module.exports = router;
