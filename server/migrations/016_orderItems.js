/**
 * order_items — Phase 1 audit's most important FK finding.
 *
 * schema.sql had `product_id ... ON DELETE CASCADE`, which means a hard
 * DELETE of a product would have silently deleted every historical
 * order_item row that ever referenced it — permanently corrupting past
 * orders' totals and item lists. productController.deleteProduct already
 * carries a comment claiming "order_items.product_id is ON DELETE RESTRICT
 * at the database level" — that comment was describing intended behaviour
 * that the actual schema did not implement. Fixed here: product_id is now
 * RESTRICT, so the database itself will refuse a hard delete of any
 * product that appears in even one historical order, no matter what future
 * application code tries to do.
 *
 * order_id stays CASCADE: order_items are fully owned by their parent
 * order (there is no order hard-delete endpoint anywhere in the app), so
 * if an order row is ever removed its line items should go with it.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('order_items', (table) => {
        table.increments('id').primary();
        table.integer('order_id').unsigned().notNullable();
        table.integer('product_id').unsigned().notNullable();
        table.string('product_name', 150).notNullable();
        table.string('sku', 50).notNullable();
        table.string('unit', 20).notNullable();
        table.decimal('price', 10, 2).notNullable();
        table.integer('quantity').notNullable();
        table.decimal('total_price', 10, 2).notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.index('order_id', 'idx_order_items_order');
        table.index('product_id', 'idx_order_items_product');

        table.foreign('order_id', 'fk_order_items_order')
            .references('id').inTable('orders')
            .onDelete('CASCADE')
            .onUpdate('CASCADE');
        table.foreign('product_id', 'fk_order_items_product')
            .references('id').inTable('products')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');

        table.check('?? > 0', ['quantity'], 'chk_order_items_qty_positive');
        table.check('?? >= 0', ['price'], 'chk_order_items_price_nonneg');
        table.check('?? >= 0', ['total_price'], 'chk_order_items_total_nonneg');
    });
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('order_items');
};