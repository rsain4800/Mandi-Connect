const { pool } = require('../config/db');
const { validateOrderQuantity, resolveEffectivePrice } = require('../utils/wholesale');
const inventoryService = require('../services/inventoryService');

// Helper to get or create cart
const getUserCartId = async (userId) => {
    const [carts] = await pool.query('SELECT id FROM cart WHERE user_id = ?', [userId]);
    if (carts.length > 0) return carts[0].id;
    const [res] = await pool.query('INSERT INTO cart (user_id) VALUES (?)', [userId]);
    return res.insertId;
};

// Get User Cart
const getCart = async (req, res) => {
    try {
        const cartId = await getUserCartId(req.user.id);

        const [items] = await pool.query(
            `SELECT ci.id AS item_id, ci.quantity,
                    p.id AS product_id, p.name, p.slug, p.price, p.discount_price,
                    p.unit, p.weight, p.thumbnail, (p.stock_quantity - p.reserved_stock) AS available_stock,
                    p.minimum_order_quantity, p.maximum_order_quantity, p.is_active
             FROM cart_items ci
             JOIN products p ON ci.product_id = p.id
             WHERE ci.cart_id = ?`,
            [cartId]
        );

        let subtotal = 0;
        const productIds = items.map((item) => item.product_id);
        let tiersByProductId = new Map();
        if (productIds.length > 0) {
            const [tierRows] = await pool.query(
                'SELECT product_id, min_quantity, max_quantity, price FROM product_price_tiers WHERE product_id IN (?)',
                [productIds]
            );
            for (const tier of tierRows) {
                if (!tiersByProductId.has(tier.product_id)) tiersByProductId.set(tier.product_id, []);
                tiersByProductId.get(tier.product_id).push(tier);
            }
        }

        const formattedItems = items.map(item => {
            const fallbackPrice = item.discount_price ? parseFloat(item.discount_price) : parseFloat(item.price);
            const { price: effectivePrice, tierApplied } = resolveEffectivePrice({
                quantity: item.quantity,
                tiers: tiersByProductId.get(item.product_id) || [],
                fallbackPrice
            });
            const total = effectivePrice * item.quantity;
            subtotal += total;
            return {
                ...item,
                effectivePrice,
                tierApplied,
                totalPrice: total
            };
        });

        return res.json({
            success: true,
            cart: {
                cart_id: cartId,
                items: formattedItems,
                subtotal
            }
        });
    } catch (error) {
        console.error('Get Cart Error:', error);
        return res.status(500).json({ success: false, message: 'Error fetching cart.' });
    }
};

// Add Product to Cart
// Backend re-validates MOQ/max/stock regardless of what the frontend sent —
// the frontend's own MOQ enforcement is for UX only (see wholesale.js).
const addToCart = async (req, res) => {
    try {
        const { product_id } = req.body;
        const cartId = await getUserCartId(req.user.id);

        const [products] = await pool.query(
            'SELECT stock_quantity, reserved_stock, is_active, unit, minimum_order_quantity, maximum_order_quantity FROM products WHERE id = ?',
            [product_id]
        );
        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }
        const product = products[0];

        // Quantity defaults to the product's MOQ (not a flat 1) — a
        // wholesale item can never be meaningfully "added" below its MOQ.
        const requestedQuantity = req.body.quantity !== undefined
            ? parseInt(req.body.quantity, 10)
            : product.minimum_order_quantity;

        // Check if item already exists in cart — MOQ/max/stock are validated
        // against the resulting total quantity for this product in the cart.
        const [existing] = await pool.query('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?', [cartId, product_id]);
        const newQty = existing.length > 0 ? existing[0].quantity + requestedQuantity : requestedQuantity;

        const validation = validateOrderQuantity({
            quantity: newQty,
            minimumOrderQuantity: product.minimum_order_quantity,
            maximumOrderQuantity: product.maximum_order_quantity,
            availableStock: inventoryService.availableStockOf(product),
            isActive: product.is_active === 1,
            unit: product.unit
        });

        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message, code: validation.code });
        }

        if (existing.length > 0) {
            await pool.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [newQty, existing[0].id]);
        } else {
            await pool.query('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)', [cartId, product_id, newQty]);
        }

        return res.json({ success: true, message: 'Item added to cart successfully!' });
    } catch (error) {
        console.error('Add to Cart Error:', error);
        return res.status(500).json({ success: false, message: 'Error adding item to cart.' });
    }
};

// Update Cart Item Quantity
const updateCartQuantity = async (req, res) => {
    try {
        const { item_id, quantity } = req.body;
        const cartId = await getUserCartId(req.user.id);
        const requestedQuantity = parseInt(quantity, 10);

        // Setting quantity to 0 (or less) is treated as "remove item" — MOQ
        // doesn't apply to removing something from the cart entirely.
        if (Number.isFinite(requestedQuantity) && requestedQuantity <= 0) {
            await pool.query('DELETE FROM cart_items WHERE id = ? AND cart_id = ?', [item_id, cartId]);
            return res.json({ success: true, message: 'Item removed from cart.' });
        }

        const [items] = await pool.query(
            `SELECT ci.id, p.stock_quantity, p.reserved_stock, p.is_active, p.unit, p.minimum_order_quantity, p.maximum_order_quantity
             FROM cart_items ci
             JOIN products p ON ci.product_id = p.id
             WHERE ci.id = ? AND ci.cart_id = ?`,
            [item_id, cartId]
        );

        if (items.length === 0) {
            return res.status(404).json({ success: false, message: 'Cart item not found.' });
        }
        const item = items[0];

        const validation = validateOrderQuantity({
            quantity: requestedQuantity,
            minimumOrderQuantity: item.minimum_order_quantity,
            maximumOrderQuantity: item.maximum_order_quantity,
            availableStock: inventoryService.availableStockOf(item),
            isActive: item.is_active === 1,
            unit: item.unit
        });

        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message, code: validation.code });
        }

        await pool.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [requestedQuantity, item_id]);
        return res.json({ success: true, message: 'Cart updated.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating cart quantity.' });
    }
};

// Remove Item from Cart
const removeFromCart = async (req, res) => {
    try {
        const itemId = req.params.itemId;
        const cartId = await getUserCartId(req.user.id);

        await pool.query('DELETE FROM cart_items WHERE id = ? AND cart_id = ?', [itemId, cartId]);
        return res.json({ success: true, message: 'Item removed from cart.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error removing item.' });
    }
};

// Clear Cart
const clearCart = async (req, res) => {
    try {
        const cartId = await getUserCartId(req.user.id);
        await pool.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
        return res.json({ success: true, message: 'Cart cleared.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error clearing cart.' });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart
};