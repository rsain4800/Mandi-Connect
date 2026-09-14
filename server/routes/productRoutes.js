const express = require('express');
const router = express.Router();
const {
    getProducts,
    getSearchSuggestions,
    getProductBySlug,
    getAdminProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    reactivateProduct
} = require('../controllers/productController');
const { verifyToken, requireAdmin, upload } = require('../middleware/authMiddleware');
const { productValidation, idParamValidation } = require('../validators');

router.get('/', getProducts);
router.get('/suggestions', getSearchSuggestions);
router.get('/admin-list', verifyToken, requireAdmin, getAdminProducts);
router.get('/:slug', getProductBySlug);

// Admin Routes
// Validation runs after `upload`, since product fields arrive as multipart
// form fields that multer parses onto req.body.
router.post('/', verifyToken, requireAdmin, upload.array('images', 5), productValidation, addProduct);
router.put('/:id', verifyToken, requireAdmin, idParamValidation, upload.array('images', 5), productValidation, updateProduct);
router.delete('/:id', verifyToken, requireAdmin, idParamValidation, deleteProduct);
router.patch('/:id/reactivate', verifyToken, requireAdmin, idParamValidation, reactivateProduct);

module.exports = router;