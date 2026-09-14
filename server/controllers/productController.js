const { pool } = require('../config/db');
const { isValidUnit } = require('../utils/units');
const { validatePriceTiers } = require('../utils/wholesale');
const inventoryService = require('../services/inventoryService');

// Columns are selected explicitly (rather than `p.*`) wherever the response
// needs to expose `available_stock` — the wholesale-facing name for what is
// still physically stored as `products.stock_quantity` (see
// migrations/productsWholesaleUpgrade.js for why the column itself wasn't
// renamed). `p.*` responses get an extra `available_stock` alias appended
// alongside it so nothing that already reads `stock_quantity` breaks.
//
// Phase 4: available_stock is now DERIVED as stock_quantity - reserved_stock
// (see migrations/productsReservedStock.js) everywhere it's read here, so a
// product that's fully reserved by other customers' pending online orders
// correctly shows as unavailable on the storefront instead of still
// advertising its full physical stock_quantity.

// Public: Advanced Product Search, Filter, Sort & Pagination
const getProducts = async (req, res) => {
    try {
        let {
            search,
            category,
            category_id,
            min_price,
            max_price,
            unit,
            rating,
            featured,
            best_seller,
            sort,
            page = 1,
            limit = 12
        } = req.query;

        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        let whereClauses = ['p.is_active = 1'];
        let queryParams = [];

        if (search) {
            whereClauses.push('(p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ? OR p.description LIKE ?)');
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (category_id) {
            whereClauses.push('p.category_id = ?');
            queryParams.push(category_id);
        } else if (category) {
            whereClauses.push('c.slug = ?');
            queryParams.push(category);
        }

        if (min_price) {
            whereClauses.push('COALESCE(p.discount_price, p.price) >= ?');
            queryParams.push(parseFloat(min_price));
        }

        if (max_price) {
            whereClauses.push('COALESCE(p.discount_price, p.price) <= ?');
            queryParams.push(parseFloat(max_price));
        }

        if (unit) {
            whereClauses.push('p.unit = ?');
            queryParams.push(unit);
        }

        if (featured === 'true' || featured === '1') {
            whereClauses.push('p.is_featured = 1');
        }

        if (best_seller === 'true' || best_seller === '1') {
            whereClauses.push('p.is_best_seller = 1');
        }

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        let orderSql = 'ORDER BY p.created_at DESC';
        if (sort === 'price_low') {
            orderSql = 'ORDER BY COALESCE(p.discount_price, p.price) ASC';
        } else if (sort === 'price_high') {
            orderSql = 'ORDER BY COALESCE(p.discount_price, p.price) DESC';
        } else if (sort === 'popular' || sort === 'best_seller') {
            orderSql = 'ORDER BY p.is_best_seller DESC, p.created_at DESC';
        } else if (sort === 'newest') {
            orderSql = 'ORDER BY p.created_at DESC';
        }

        // Count query
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ${whereSql}
        `;
        const [countResult] = await pool.query(countQuery, queryParams);
        const totalProducts = countResult[0].total;

        // Data query with avg rating. stock_quantity is aliased to
        // available_stock (the wholesale-facing name) alongside itself so
        // both names are present in the payload without a breaking rename.
        const dataQuery = `
            SELECT p.*, (p.stock_quantity - p.reserved_stock) AS available_stock,
                   c.name AS category_name, c.slug AS category_slug,
                   COALESCE(AVG(r.rating), 0) AS avg_rating,
                   COUNT(r.id) AS review_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = 1
            ${whereSql}
            GROUP BY p.id
            ${orderSql}
            LIMIT ? OFFSET ?
        `;

        const [products] = await pool.query(dataQuery, [...queryParams, limit, offset]);

        return res.json({
            success: true,
            products,
            pagination: {
                total: totalProducts,
                page,
                limit,
                totalPages: Math.ceil(totalProducts / limit)
            }
        });
    } catch (error) {
        console.error('Get Products Error:', error);
        return res.status(500).json({ success: false, message: 'Error fetching products.' });
    }
};

// Public: Get Search Suggestions
const getSearchSuggestions = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json({ success: true, suggestions: [] });
        }

        const searchTerm = `%${q}%`;
        const [suggestions] = await pool.query(
            `SELECT p.id, p.name, p.slug, p.thumbnail, p.price, p.discount_price, p.unit,
                    p.minimum_order_quantity, c.name as category_name
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.is_active = 1 AND (p.name LIKE ? OR p.brand LIKE ? OR c.name LIKE ?)
             LIMIT 6`,
            [searchTerm, searchTerm, searchTerm]
        );

        return res.json({ success: true, suggestions });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching suggestions.' });
    }
};

// Public: Get Product by ID or Slug
const getProductBySlug = async (req, res) => {
    try {
        const identifier = req.params.slug;
        const isNumeric = !isNaN(identifier);

        const whereField = isNumeric ? 'p.id = ?' : 'p.slug = ?';

        const [products] = await pool.query(
            `SELECT p.*, (p.stock_quantity - p.reserved_stock) AS available_stock,
                    c.name AS category_name, c.slug AS category_slug,
                    COALESCE(AVG(r.rating), 0) AS avg_rating,
                    COUNT(r.id) AS review_count
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = 1
             WHERE ${whereField}
             GROUP BY p.id`,
            [identifier]
        );

        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const product = products[0];

        // Fetch gallery images
        const [images] = await pool.query('SELECT id, image_url FROM product_images WHERE product_id = ?', [product.id]);
        product.images = images.map(img => img.image_url);
        if (product.thumbnail && !product.images.includes(product.thumbnail)) {
            product.images.unshift(product.thumbnail);
        }

        // Fetch wholesale price tiers, ascending by minimum quantity, so the
        // storefront can render "5–20 = ₹X, 21–50 = ₹Y, 51+ = ₹Z" in order.
        const [priceTiers] = await pool.query(
            'SELECT id, min_quantity, max_quantity, price FROM product_price_tiers WHERE product_id = ? ORDER BY min_quantity ASC',
            [product.id]
        );
        product.price_tiers = priceTiers;

        // Fetch related products
        const [related] = await pool.query(
            `SELECT id, name, slug, price, discount_price, unit, weight, thumbnail,
                    (stock_quantity - reserved_stock) AS available_stock, minimum_order_quantity
             FROM products
             WHERE category_id = ? AND id != ? AND is_active = 1
             LIMIT 4`,
            [product.category_id, product.id]
        );

        return res.json({
            success: true,
            product,
            relatedProducts: related
        });
    } catch (error) {
        console.error('Get product detail error:', error);
        return res.status(500).json({ success: false, message: 'Error fetching product detail.' });
    }
};

// Admin: Get all products for dashboard list
const getAdminProducts = async (req, res) => {
    try {
        // Admins see the full picture: stock_quantity/reserved_stock as
        // stored, plus available_stock and sold_stock derived on read
        // (never stored — see migrations/productsReservedStock.js).
        const [products] = await pool.query(
            `SELECT p.*, (p.stock_quantity - p.reserved_stock) AS available_stock,
                    c.name AS category_name,
                    (SELECT COUNT(*) FROM product_price_tiers t WHERE t.product_id = p.id) AS price_tier_count,
                    COALESCE((
                        SELECT -SUM(it.quantity) FROM inventory_transactions it
                        WHERE it.product_id = p.id AND it.transaction_type = 'SALE'
                    ), 0)
                    -
                    COALESCE((
                        SELECT SUM(it.quantity) FROM inventory_transactions it
                        WHERE it.product_id = p.id AND it.transaction_type = 'RETURN'
                    ), 0) AS sold_stock
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             ORDER BY p.id DESC`
        );
        return res.json({ success: true, products });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching admin products.' });
    }
};

// Replaces a product's wholesale price tiers inside an existing transaction.
// Shared by addProduct/updateProduct. Tiers were already schema-validated by
// productValidation (validatePriceTiers) before this runs.
const replacePriceTiers = async (connection, productId, rawPriceTiers) => {
    if (rawPriceTiers === undefined) return; // field omitted entirely -> leave tiers untouched
    let tiers = rawPriceTiers;
    if (typeof tiers === 'string') {
        tiers = tiers ? JSON.parse(tiers) : [];
    }
    if (!Array.isArray(tiers)) tiers = [];

    await connection.query('DELETE FROM product_price_tiers WHERE product_id = ?', [productId]);
    for (const tier of tiers) {
        await connection.query(
            'INSERT INTO product_price_tiers (product_id, min_quantity, max_quantity, price) VALUES (?, ?, ?, ?)',
            [productId, parseInt(tier.min_quantity, 10), tier.max_quantity ? parseInt(tier.max_quantity, 10) : null, parseFloat(tier.price)]
        );
    }
};

// Admin: Add New Product
const addProduct = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            name,
            sku,
            description,
            category_id,
            subcategory,
            brand,
            price,
            discount_price,
            unit,
            weight,
            minimum_order_quantity,
            maximum_order_quantity,
            grade,
            quality,
            origin,
            origin_district,
            origin_mandi,
            price_tiers,
            is_featured,
            is_best_seller,
            is_active
        } = req.body;

        // available_stock is the wholesale-facing field name; stock_quantity
        // is still accepted for backward compatibility (see validators/index.js).
        const availableStock = req.body.available_stock !== undefined ? req.body.available_stock : req.body.stock_quantity;

        if (!name || !price || !category_id || !unit) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Required fields: Name, Price, Category, Unit.' });
        }

        if (!isValidUnit(unit)) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: `Invalid unit: ${unit}.` });
        }

        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);
        const generatedSku = sku || 'MND-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        let thumbnail = req.body.thumbnail || null;
        const galleryImages = [];

        if (req.files && req.files.length > 0) {
            thumbnail = `/uploads/${req.files[0].filename}`;
            req.files.forEach(file => galleryImages.push(`/uploads/${file.filename}`));
        }

        const numPrice = parseFloat(price);
        const numDiscPrice = discount_price ? parseFloat(discount_price) : null;
        let discount_percentage = 0;
        if (numDiscPrice && numDiscPrice < numPrice) {
            discount_percentage = Math.round(((numPrice - numDiscPrice) / numPrice) * 100);
        }

        const moq = minimum_order_quantity ? parseInt(minimum_order_quantity, 10) : 1;
        const maxOq = maximum_order_quantity ? parseInt(maximum_order_quantity, 10) : null;

        const [result] = await connection.query(
            `INSERT INTO products (
                name, slug, sku, description, category_id, subcategory, brand,
                price, discount_price, discount_percentage, stock_quantity,
                unit, weight, minimum_order_quantity, maximum_order_quantity,
                grade, quality, origin, origin_district, origin_mandi,
                thumbnail, is_featured, is_best_seller, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                slug,
                generatedSku,
                description || null,
                category_id,
                subcategory || null,
                brand || 'Mandi Direct',
                numPrice,
                numDiscPrice,
                discount_percentage,
                parseInt(availableStock || 0, 10),
                unit,
                weight || '1 unit',
                moq,
                maxOq,
                grade || null,
                quality || null,
                origin || null,
                origin_district || null,
                origin_mandi || null,
                thumbnail,
                is_featured ? 1 : 0,
                is_best_seller ? 1 : 0,
                is_active !== undefined ? (is_active ? 1 : 0) : 1
            ]
        );

        const productId = result.insertId;

        for (const imgUrl of galleryImages) {
            await connection.query('INSERT INTO product_images (product_id, image_url) VALUES (?, ?)', [productId, imgUrl]);
        }

        await replacePriceTiers(connection, productId, price_tiers);

        // Phase 4: even a brand-new product's starting stock gets one
        // inventory_transactions row, so a product's full stock history —
        // "how much has this product ever had, from day one" — is always
        // reconstructable from the ledger with no special-cased gap at t=0.
        const initialStock = parseInt(availableStock || 0, 10);
        if (initialStock > 0) {
            await inventoryService.logTransaction(connection, {
                productId,
                transactionType: 'PURCHASE',
                quantity: initialStock,
                referenceType: 'ADMIN',
                referenceId: req.user.id,
                previousQuantity: 0,
                newQuantity: initialStock,
                createdBy: req.user.full_name,
                notes: 'Initial stock at product creation.'
            });
        }

        await connection.commit();
        connection.release();

        return res.status(201).json({
            success: true,
            message: 'Product added successfully!',
            productId
        });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Add product error:', error);
        return res.status(500).json({ success: false, message: 'Error creating product.' });
    }
};

// Admin: Update Product
const updateProduct = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const productId = req.params.id;
        const {
            name,
            sku,
            description,
            category_id,
            subcategory,
            brand,
            price,
            discount_price,
            unit,
            weight,
            minimum_order_quantity,
            maximum_order_quantity,
            grade,
            quality,
            origin,
            origin_district,
            origin_mandi,
            price_tiers,
            is_featured,
            is_best_seller,
            is_active
        } = req.body;

        const availableStock = req.body.available_stock !== undefined ? req.body.available_stock : req.body.stock_quantity;

        const [existing] = await connection.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [productId]);
        if (existing.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        if (unit && !isValidUnit(unit)) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: `Invalid unit: ${unit}.` });
        }

        const curr = existing[0];
        let thumbnail = curr.thumbnail;

        if (req.files && req.files.length > 0) {
            thumbnail = `/uploads/${req.files[0].filename}`;
            for (const file of req.files) {
                await connection.query('INSERT INTO product_images (product_id, image_url) VALUES (?, ?)', [productId, `/uploads/${file.filename}`]);
            }
        }

        const numPrice = price ? parseFloat(price) : curr.price;
        const numDiscPrice = discount_price !== undefined && discount_price !== '' ? parseFloat(discount_price) : curr.discount_price;
        let discount_percentage = 0;
        if (numDiscPrice && numDiscPrice < numPrice) {
            discount_percentage = Math.round(((numPrice - numDiscPrice) / numPrice) * 100);
        }

        const moq = minimum_order_quantity !== undefined && minimum_order_quantity !== ''
            ? parseInt(minimum_order_quantity, 10)
            : curr.minimum_order_quantity;
        const maxOq = maximum_order_quantity !== undefined
            ? (maximum_order_quantity === '' || maximum_order_quantity === null ? null : parseInt(maximum_order_quantity, 10))
            : curr.maximum_order_quantity;

        if (maxOq !== null && maxOq < moq) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Maximum order quantity cannot be less than the minimum order quantity.' });
        }

        // Phase 4: stock_quantity is intentionally NOT part of this UPDATE.
        // Every stock change — including one made through this edit form —
        // must produce an inventory_transactions row, so it goes through
        // inventoryService.adjustStock (below) instead of a silent raw
        // UPDATE that would leave the ledger out of sync with reality.
        await connection.query(
            `UPDATE products
             SET name = ?, description = ?, category_id = ?, subcategory = ?, brand = ?,
                 price = ?, discount_price = ?, discount_percentage = ?,
                 unit = ?, weight = ?, minimum_order_quantity = ?, maximum_order_quantity = ?,
                 grade = ?, quality = ?, origin = ?, origin_district = ?, origin_mandi = ?,
                 thumbnail = ?, is_featured = ?, is_best_seller = ?, is_active = ?
             WHERE id = ?`,
            [
                name || curr.name,
                description !== undefined ? description : curr.description,
                category_id || curr.category_id,
                subcategory !== undefined ? subcategory : curr.subcategory,
                brand || curr.brand,
                numPrice,
                numDiscPrice,
                discount_percentage,
                unit || curr.unit,
                weight || curr.weight,
                moq,
                maxOq,
                grade !== undefined ? (grade || null) : curr.grade,
                quality !== undefined ? (quality || null) : curr.quality,
                origin !== undefined ? (origin || null) : curr.origin,
                origin_district !== undefined ? (origin_district || null) : curr.origin_district,
                origin_mandi !== undefined ? (origin_mandi || null) : curr.origin_mandi,
                thumbnail,
                is_featured !== undefined ? (is_featured ? 1 : 0) : curr.is_featured,
                is_best_seller !== undefined ? (is_best_seller ? 1 : 0) : curr.is_best_seller,
                is_active !== undefined ? (is_active ? 1 : 0) : curr.is_active,
                productId
            ]
        );

        // If the form also carried a stock change, apply it as a logged
        // ADJUSTMENT/PURCHASE (never a bare column write) — `curr` was read
        // with FOR UPDATE above, so this is safe against a concurrent
        // reservation/sale racing the same row.
        const newStockQuantity = availableStock !== undefined && availableStock !== ''
            ? parseInt(availableStock, 10)
            : curr.stock_quantity;
        const stockDelta = newStockQuantity - curr.stock_quantity;

        if (stockDelta !== 0) {
            try {
                await inventoryService.adjustStock(connection, {
                    lockedProduct: curr,
                    delta: stockDelta,
                    transactionType: stockDelta > 0 ? 'PURCHASE' : 'ADJUSTMENT',
                    adminId: req.user.id,
                    createdBy: req.user.full_name,
                    reason: req.body.stock_change_reason || 'Stock updated via product edit form.'
                });
            } catch (adjErr) {
                if (adjErr.code) {
                    await connection.rollback();
                    connection.release();
                    return res.status(400).json({ success: false, message: adjErr.message, code: adjErr.code });
                }
                throw adjErr;
            }
        }

        await replacePriceTiers(connection, productId, price_tiers);

        await connection.commit();
        connection.release();

        return res.json({ success: true, message: 'Product updated successfully.' });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Update Product Error:', error);
        return res.status(500).json({ success: false, message: 'Error updating product.' });
    }
};

// Admin: Deactivate Product — never hard-deletes. A product with historical
// orders can never be hard-deleted (order_items.product_id is ON DELETE
// RESTRICT at the database level) — deactivating it is the correct action
// either way: it disappears from the storefront while every past order,
// invoice, and order_items row referencing it stays intact.
const deleteProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const [existing] = await pool.query('SELECT id FROM products WHERE id = ?', [productId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }
        await pool.query('UPDATE products SET is_active = 0 WHERE id = ?', [productId]);
        return res.json({ success: true, message: 'Product deactivated successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error deactivating product.' });
    }
};

// Admin: Reactivate a previously deactivated product.
const reactivateProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const [existing] = await pool.query('SELECT id FROM products WHERE id = ?', [productId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }
        await pool.query('UPDATE products SET is_active = 1 WHERE id = ?', [productId]);
        return res.json({ success: true, message: 'Product reactivated successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error reactivating product.' });
    }
};

module.exports = {
    getProducts,
    getSearchSuggestions,
    getProductBySlug,
    getAdminProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    reactivateProduct
};