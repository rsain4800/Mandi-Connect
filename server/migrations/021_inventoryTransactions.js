/**
 * inventory_transactions — Phase 4. Append-only ledger of every stock
 * movement on `products`. This is the single source of truth for "what
 * happened to this product's stock and why" — every mutation made through
 * services/inventoryService.js (reserveStock, releaseReservation,
 * fulfillReservedSale, sellDirect, restockReturn, logRefundNoRestock,
 * adjustStock) writes exactly one row here in the same DB transaction as
 * the products.stock_quantity / products.reserved_stock UPDATE it
 * describes, so the two can never drift apart — reconstructing
 * `sold_stock` (SUM of SALE minus RETURN quantities, per migrations/
 * productsReservedStock.js) or any other derived figure is always a
 * SELECT against this table, never a separately-maintained counter.
 *
 * `quantity` is signed and represents the delta actually applied on this
 * transaction's operand column (reserved_stock for RESERVATION/RELEASE,
 * stock_quantity for everything else): negative for stock leaving/held
 * against a customer (SALE, RELEASE), positive for stock coming back or
 * being added (PURCHASE, RETURN, positive ADJUSTMENT), zero only for the
 * no-op REFUND-without-restock audit row (see inventoryService.logRefundNoRestock).
 *
 * `previous_quantity`/`new_quantity` snapshot the operand column's value
 * immediately before/after this transaction, so a full audit trail can be
 * replayed for a product without needing to already know the running
 * total — each row is self-describing.
 *
 * `reference_type`/`reference_id` is a lightweight polymorphic pointer
 * (ORDER -> orders.id, ADMIN -> the acting admin's users.id, SYSTEM -> no
 * row, e.g. the background reservation-expiry sweep). No FK is declared
 * on reference_id since it deliberately points at different tables
 * depending on reference_type — enforcing referential integrity here
 * would need a CHECK trigger MySQL 8 doesn't support declaratively, and
 * every actual writer already goes through inventoryService.logTransaction,
 * which is the real integrity boundary for this table.
 *
 * product_id keeps the same RESTRICT convention as order_items.product_id
 * (migrations/orderItems.js) — a product's transaction history must
 * survive as long as the product row itself does, and products are never
 * hard-deleted in this codebase (only deactivated — see
 * productController.deleteProduct).
 */
exports.up = async function up(knex) {
    await knex.schema.createTable('inventory_transactions', (table) => {
        table.increments('id').primary();

        table.integer('product_id').unsigned().notNullable();

        table.enu(
            'transaction_type',
            ['PURCHASE', 'RESERVATION', 'RELEASE', 'SALE', 'ADJUSTMENT', 'RETURN', 'REFUND'],
            { useNative: true, enumName: 'inventory_transactions_type_enum' }
        ).notNullable();

        // Signed delta applied to whichever column this transaction type
        // operates on. See file-level comment for the sign convention.
        table.integer('quantity').notNullable();

        table.enu(
            'reference_type',
            ['ORDER', 'ADMIN', 'SYSTEM'],
            { useNative: true, enumName: 'inventory_transactions_reference_type_enum' }
        ).notNullable();
        // Polymorphic on purpose (orders.id for ORDER, users.id for ADMIN,
        // null for SYSTEM) — see file-level comment for why no FK is declared.
        table.integer('reference_id').unsigned().nullable();

        table.integer('previous_quantity').notNullable();
        table.integer('new_quantity').notNullable();

        // Human/system actor label (admin's full_name, 'Razorpay System',
        // 'System' for the expiry sweep) — deliberately a plain string, not
        // a users.id FK, so the ledger keeps a readable, immutable record
        // even if the acting user's account is later renamed or removed.
        table.string('created_by', 100).notNullable().defaultTo('System');
        table.text('notes').nullable();

        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.index('product_id', 'idx_inventory_txn_product');
        table.index('transaction_type', 'idx_inventory_txn_type');
        table.index('created_at', 'idx_inventory_txn_created_at');
        table.index(['reference_type', 'reference_id'], 'idx_inventory_txn_reference');

        table.foreign('product_id', 'fk_inventory_txn_product')
            .references('id').inTable('products')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');

        // previous/new_quantity are snapshots of a stock counter, which is
        // itself guarded >= 0 by chk_products_stock_nonneg / _reserved_nonneg —
        // mirrored here so a corrupt/negative snapshot can never even be
        // inserted, independent of whatever products currently holds.
        table.check('?? >= 0', ['previous_quantity'], 'chk_inventory_txn_prev_nonneg');
        table.check('?? >= 0', ['new_quantity'], 'chk_inventory_txn_new_nonneg');
    });
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('inventory_transactions');
};