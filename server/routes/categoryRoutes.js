const express = require('express');
const router = express.Router();
const {
    getCategories,
    getCategoryBySlug,
    addCategory,
    updateCategory,
    deleteCategory
} = require('../controllers/categoryController');
const { verifyToken, requireAdmin, upload } = require('../middleware/authMiddleware');
const { categoryValidation, idParamValidation } = require('../validators');

router.get('/', getCategories);
router.get('/:slug', getCategoryBySlug);

// Admin Routes
// Validation runs after `upload`, since category name/description arrive as
// multipart form fields that multer parses onto req.body.
router.post('/', verifyToken, requireAdmin, upload.single('image'), categoryValidation, addCategory);
router.put('/:id', verifyToken, requireAdmin, idParamValidation, upload.single('image'), categoryValidation, updateCategory);
router.delete('/:id', verifyToken, requireAdmin, idParamValidation, deleteCategory);

module.exports = router;