const express = require('express');
const router = express.Router();
const {
    getShippingSettings,
    updateShippingSettings
} = require('../controllers/shippingController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/', getShippingSettings);
router.put('/', verifyToken, requireAdmin, updateShippingSettings);

module.exports = router;
