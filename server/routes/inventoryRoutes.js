const express = require('express');
const router = express.Router();
const {
    adjustStock,
    getProductTransactions,
    getInventorySnapshot,
    triggerExpirySweep
} = require('../controllers/inventoryController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');
const { adjustStockValidation, productIdParamValidation } = require('../validators');

router.use(verifyToken);
router.use(requireAdmin);

router.get('/', getInventorySnapshot);
router.get('/:productId/transactions', productIdParamValidation, getProductTransactions);
router.post('/adjust', adjustStockValidation, adjustStock);
router.post('/sweep-expired', triggerExpirySweep);

module.exports = router;