/**
 * Phase 4 — inventory reservation. Adds `reserved_stock` to `products`.
 *
 * Design decision (spec explicitly asks not to duplicate stock values that
 * can be safely derived — same principle migrations/productsWholesaleUpgrade.js
 * already applied to available_stock):
 *
 *   - `stock_quantity` keeps its existing meaning of "total stock currently
 *     owned, not yet sold" (physical stock on hand). It is unchanged by a
 *     reservation and only decreases when stock actually leaves inventory
 *     (a SALE) or an admin adjustment/damage write-off happens.
 *   - `reserved_stock` (NEW) is the quantity currently held against orders
 *     that are awaiting online payment confirmation — not yet sold, but not
 *     purchasable by anyone else either.
 *   - `available_stock` (what customers can actually buy right now) is
 *     DERIVED as `stock_quantity - reserved_stock` everywhere it's read
 *     (productController, cartController, orderController) rather than
 *     stored, so it can never drift out of sync with its two inputs.
 *   - `sold_stock` (for admin reporting) is likewise NOT stored on this
 *     table — it's derived from inventory_transactions (SUM of SALE minus
 *     RETURN quantities), the same pattern adminDashboardController already
 *     uses for "top selling products" (SUM(order_items.quantity)).
 *
 * chk_products_reserved_le_stock is the database-level guarantee that
 * available_stock (stock_quantity - reserved_stock) can never go negative,
 * no matter what application code does — belt-and-braces alongside the
 * row-locking + application-level checks in orderController/inventoryService.
 */
exports.up = async function up(knex) {
    await knex.schema.alterTable('products', (table) => {
        table.integer('reserved_stock').unsigned().notNullable().defaultTo(0);
    });

    // Added as raw SQL rather than a second table.check() call: knex's `??`
    // identifier-binding only resolves correctly for checks declared in the
    // SAME alterTable() callback as the column they reference (confirmed
    // against this project's knex/mysql2 versions — a separate alterTable()
    // call left the literal '??' in the generated SQL instead of the column
    // name). Raw SQL sidesteps that entirely and is unambiguous either way.
    await knex.raw(
        'ALTER TABLE `products` ' +
        'ADD CONSTRAINT `chk_products_reserved_nonneg` CHECK (`reserved_stock` >= 0), ' +
        'ADD CONSTRAINT `chk_products_reserved_le_stock` CHECK (`reserved_stock` <= `stock_quantity`)'
    );
};

exports.down = async function down(knex) {
    await knex.schema.alterTable('products', (table) => {
        table.dropChecks(['chk_products_reserved_nonneg', 'chk_products_reserved_le_stock']);
        table.dropColumn('reserved_stock');
    });
};