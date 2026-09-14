const { pool } = require('../config/db');

// Public: Get all active categories
const getCategories = async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT * FROM categories ORDER BY name ASC');
        return res.json({ success: true, categories });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching categories.' });
    }
};

// Public: Get single category by slug
const getCategoryBySlug = async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT * FROM categories WHERE slug = ?', [req.params.slug]);
        if (categories.length === 0) {
            return res.status(404).json({ success: false, message: 'Category not found.' });
        }
        return res.json({ success: true, category: categories[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching category.' });
    }
};

// Admin: Add Category
const addCategory = async (req, res) => {
    try {
        const { name, slug, description } = req.body;
        let image = null;

        if (req.file) {
            image = `/uploads/${req.file.filename}`;
        }

        const categorySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

        const [result] = await pool.query(
            'INSERT INTO categories (name, slug, description, image) VALUES (?, ?, ?, ?)',
            [name, categorySlug, description || null, image]
        );

        return res.status(201).json({
            success: true,
            message: 'Category created successfully!',
            category: { id: result.insertId, name, slug: categorySlug, description, image, is_active: 1 }
        });
    } catch (error) {
        console.error('Add Category Error:', error);
        return res.status(500).json({ success: false, message: 'Error creating category.' });
    }
};

// Admin: Edit Category
const updateCategory = async (req, res) => {
    try {
        const { name, slug, description, is_active } = req.body;
        const categoryId = req.params.id;

        const [existing] = await pool.query('SELECT * FROM categories WHERE id = ?', [categoryId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Category not found.' });
        }

        let image = existing[0].image;
        if (req.file) {
            image = `/uploads/${req.file.filename}`;
        }

        const categorySlug = slug || name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : existing[0].slug;

        await pool.query(
            `UPDATE categories
             SET name = ?, slug = ?, description = ?, image = ?, is_active = ?
             WHERE id = ?`,
            [name || existing[0].name, categorySlug, description || existing[0].description, image, is_active !== undefined ? is_active : existing[0].is_active, categoryId]
        );

        return res.json({ success: true, message: 'Category updated successfully!' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating category.' });
    }
};

// Admin: Delete Category — always deactivates rather than hard-deleting.
// A category with any products still assigned to it can never be hard-deleted
// (products.category_id is ON DELETE RESTRICT at the database level), which
// previously would have cascaded through to delete those products' order_items
// history. Deactivating is safe regardless of whether products are assigned.
const deleteCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const [existing] = await pool.query('SELECT id FROM categories WHERE id = ?', [categoryId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Category not found.' });
        }
        await pool.query('UPDATE categories SET is_active = 0 WHERE id = ?', [categoryId]);
        return res.json({ success: true, message: 'Category deactivated successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error deactivating category.' });
    }
};

module.exports = {
    getCategories,
    getCategoryBySlug,
    addCategory,
    updateCategory,
    deleteCategory
};