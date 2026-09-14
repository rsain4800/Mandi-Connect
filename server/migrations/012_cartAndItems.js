/**
 * cart / cart_items — one active cart per user (transient shopping state,
 * not a historical business record — order_items is the durable snapshot
 * taken at checkout). CASCADE on user_id/cart_id/product_id is correct
 * here: if a user or product were ever actually removed, there is no
 * business reason to keep dangling cart rows around.
 */
exports.up = function up(knex) {
    return knex.schema
        .createTable('cart', (table) => {
            table.increments('id').primary();
            table.integer('user_id').unsigned().notNullable();
            table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

            table.unique('user_id', { indexName: 'cart_user_unique' });

            table.foreign('user_id', 'fk_cart_user')
                .references('id').inTable('users')
                .onDelete('CASCADE')
                .onUpdate('CASCADE');
        })
        .then(() => knex.raw(
            'ALTER TABLE `cart` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ))
        .then(() => knex.schema.createTable('cart_items', (table) => {
            table.increments('id').primary();
            table.integer('cart_id').unsigned().notNullable();
            table.integer('product_id').unsigned().notNullable();
            table.integer('quantity').notNullable().defaultTo(1);
            table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

            table.unique(['cart_id', 'product_id'], { indexName: 'unique_cart_product' });
            table.index('product_id', 'idx_cart_items_product');

            table.foreign('cart_id', 'fk_cart_items_cart')
                .references('id').inTable('cart')
                .onDelete('CASCADE')
                .onUpdate('CASCADE');
            table.foreign('product_id', 'fk_cart_items_product')
                .references('id').inTable('products')
                .onDelete('CASCADE')
                .onUpdate('CASCADE');

            table.check('?? > 0', ['quantity'], 'chk_cart_items_qty_positive');
        }))
        .then(() => knex.raw(
            'ALTER TABLE `cart_items` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        ));
};

exports.down = function down(knex) {
    return knex.schema
        .dropTableIfExists('cart_items')
        .then(() => knex.schema.dropTableIfExists('cart'));
};