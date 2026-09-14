const { pool } = require('../config/db');
const { validateOrderQuantity } = require('../utils/wholesale');

const getUserWishlistId = async (userId) => {
    const [wishlists] = await pool.query('SELECT id FROM wishlist WHERE user_id = ?', [userId]);
    if (wishlists.length > 0) return wishlists[0].id;
    const [res] = await pool.query('INSERT INTO wishlist (user_id) VALUES (?)', [userId]);
    return res.insertId;
};

// Get User Wishlist
const getWishlist = async (req, res) => {
    try {
        const wishlistId = await getUserWishlistId(req.user.id);
        const [items] = await pool.query(
            `SELECT wi.id AS wishlist_item_id, p.*
             FROM wishlist_items wi
             JOIN products p ON wi.product_id = p.id
             WHERE wi.wishlist_id = ?`,
            [wishlistId]
        );
        return res.json({ success: true, items });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching wishlist.' });
    }
};

// Add to Wishlist
const addToWishlist = async (req, res) => {
    try {
        const { product_id } = req.body;
        const wishlistId = await getUserWishlistId(req.user.id);

        const [existing] = await pool.query('SELECT id FROM wishlist_items WHERE wishlist_id = ? AND product_id = ?', [wishlistId, product_id]);
        if (existing.length > 0) {
            return res.json({ success: true, message: 'Product already in wishlist.' });
        }

        await pool.query('INSERT INTO wishlist_items (wishlist_id, product_id) VALUES (?, ?)', [wishlistId, product_id]);
        return res.json({ success: true, message: 'Added to wishlist!' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error adding to wishlist.' });
    }
};

// Remove from Wishlist
const removeFromWishlist = async (req, res) => {
    try {
        const productId = req.params.productId;
        const wishlistId = await getUserWishlistId(req.user.id);

        await pool.query('DELETE FROM wishlist_items WHERE wishlist_id = ? AND product_id = ?', [wishlistId, productId]);
        return res.json({ success: true, message: 'Removed from wishlist.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error removing from wishlist.' });
    }
};

// Move Wishlist Item to Cart
// Moves in at the product's MOQ (a wholesale item can't meaningfully move
// into the cart at "1" the way a retail item could) and re-validates
// MOQ/max/stock the same way addToCart does.
const moveToCart = async (req, res) => {
    try {
        const { product_id } = req.body;
        const wishlistId = await getUserWishlistId(req.user.id);

        // Get or create cart
        const [carts] = await pool.query('SELECT id FROM cart WHERE user_id = ?', [req.user.id]);
        const cartId = carts.length > 0 ? carts[0].id : (await pool.query('INSERT INTO cart (user_id) VALUES (?)', [req.user.id]))[0].insertId;

        const [products] = await pool.query(
            'SELECT stock_quantity, is_active, unit, minimum_order_quantity, maximum_order_quantity FROM products WHERE id = ?',
            [product_id]
        );
        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }
        const product = products[0];

        const [existingCart] = await pool.query('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?', [cartId, product_id]);
        const addQty = product.minimum_order_quantity;
        const newQty = existingCart.length > 0 ? existingCart[0].quantity + addQty : addQty;

        const validation = validateOrderQuantity({
            quantity: newQty,
            minimumOrderQuantity: product.minimum_order_quantity,
            maximumOrderQuantity: product.maximum_order_quantity,
            availableStock: product.stock_quantity,
            isActive: product.is_active === 1,
            unit: product.unit
        });

        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message, code: validation.code });
        }

        if (existingCart.length > 0) {
            await pool.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [newQty, existingCart[0].id]);
        } else {
            await pool.query('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)', [cartId, product_id, newQty]);
        }

        // Remove from wishlist
        await pool.query('DELETE FROM wishlist_items WHERE wishlist_id = ? AND product_id = ?', [wishlistId, product_id]);

        return res.json({ success: true, message: 'Item moved to cart!' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error moving item to cart.' });
    }
};

module.exports = {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    moveToCart
};