const { pool } = require('../config/db');
const logger = require('../utils/logger');
const inventoryService = require('../services/inventoryService');

// Admin: manual stock adjustment (intake or correction), always reasoned.
// e.g. { product_id: 12, delta: 100, reason: "New stock received" }
//   or  { product_id: 12, delta: -5, reason: "Damaged stock" }
//
// `transaction_type` is optional — defaults to PURCHASE for a positive
// delta (new stock arriving) and ADJUSTMENT for a negative delta (damage/
// loss/recount-down), matching the spec's own examples. An admin can
// still override it explicitly (e.g. a positive recount correction should
// probably be logged as ADJUSTMENT, not PURCHASE).
const adjustStock = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const productId = parseInt(req.body.product_id, 10);
        const delta = parseInt(req.body.delta, 10);
        const reason = req.body.reason;
        const transactionType = req.body.transaction_type || (delta > 0 ? 'PURCHASE' : 'ADJUSTMENT');

        const lockedById = await inventoryService.lockProductsForUpdate(connection, [productId]);
        const lockedProduct = lockedById.get(productId);
        if (!lockedProduct) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const { previous, next } = await inventoryService.adjustStock(connection, {
            lockedProduct,
            delta,
            transactionType,
            adminId: req.user.id,
            createdBy: req.user.full_name,
            reason
        });

        await connection.commit();
        connection.release();

        return res.json({
            success: true,
            message: `Stock ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)}.`,
            product_id: productId,
            previous_stock: previous,
            new_stock: next
        });
    } catch (error) {
        await connection.rollback();
        connection.release();

        // Errors thrown by inventoryService.adjustStock carry a `.code` and
        // an already-user-facing `.message` (invalid quantity, missing
        // reason, would go negative, would dip below what's reserved) —
        // surface those as 400s rather than a generic 500.
        if (error.code) {
            return res.status(400).json({ success: false, message: error.message, code: error.code });
        }
        logger.error({ err: error }, 'Admin stock adjustment error');
        return res.status(500).json({ success: false, message: 'Error adjusting stock.' });
    }
};

// Admin: paginated transaction history for one product — the audit trail
// backing every stock movement (reservations, releases, sales, admin
// adjustments, returns, refunds) for that product.
const getProductTransactions = async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const offset = (page - 1) * limit;

        const [product] = await pool.query('SELECT id, name, sku FROM products WHERE id = ?', [productId]);
        if (product.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const [[{ total }]] = await pool.query(
            'SELECT COUNT(*) AS total FROM inventory_transactions WHERE product_id = ?',
            [productId]
        );

        const [transactions] = await pool.query(
            `SELECT id, transaction_type, quantity, reference_type, reference_id,
                    previous_quantity, new_quantity, created_by, notes, created_at
             FROM inventory_transactions
             WHERE product_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ? OFFSET ?`,
            [productId, limit, offset]
        );

        return res.json({
            success: true,
            product: product[0],
            transactions,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        logger.error({ err: error }, 'Get product transactions error');
        return res.status(500).json({ success: false, message: 'Error fetching inventory history.' });
    }
};

// Admin: inventory snapshot across all products — stock_quantity/
// reserved_stock as stored, available_stock/sold_stock derived (never
// stored — see migrations/productsReservedStock.js and inventoryService.js
// header comment).
const getInventorySnapshot = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT p.id, p.name, p.sku, p.unit, p.is_active,
                    p.stock_quantity,
                    p.reserved_stock,
                    (p.stock_quantity - p.reserved_stock) AS available_stock,
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
             ORDER BY p.name ASC`
        );

        return res.json({ success: true, inventory: rows });
    } catch (error) {
        logger.error({ err: error }, 'Get inventory snapshot error');
        return res.status(500).json({ success: false, message: 'Error fetching inventory snapshot.' });
    }
};

// Admin: manually trigger the expired-reservation sweep on demand — useful
// for ops (force-release a stuck reservation without waiting for the
// background timer) and for tests. Same function the background timer in
// server.js runs periodically and orderController.createOrder runs scoped
// to a single checkout's products.
const triggerExpirySweep = async (req, res) => {
    try {
        const releasedCount = await inventoryService.releaseExpiredReservations(pool);
        return res.json({ success: true, message: `Released ${releasedCount} expired reservation(s).`, releasedCount });
    } catch (error) {
        logger.error({ err: error }, 'Manual expiry sweep error');
        return res.status(500).json({ success: false, message: 'Error running expiry sweep.' });
    }
};

module.exports = {
    adjustStock,
    getProductTransactions,
    getInventorySnapshot,
    triggerExpirySweep
};