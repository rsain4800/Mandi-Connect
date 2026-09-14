const express = require('express');
const router = express.Router();
const {
    getDashboardMetrics,
    getAdminCustomers,
    toggleCustomerStatus,
    getAnalyticsReports
} = require('../controllers/adminDashboardController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.use(verifyToken);
router.use(requireAdmin);

router.get('/metrics', getDashboardMetrics);
router.get('/customers', getAdminCustomers);
router.put('/customers/:id/status', toggleCustomerStatus);
router.get('/reports', getAnalyticsReports);

module.exports = router;
