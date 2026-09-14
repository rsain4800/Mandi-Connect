/**
 * wishlist / wishlist_items — same reasoning as cart/cart_items: transient
 * user state, not a historical record, so CASCADE is appropriate.
 */
exports.up = function up(knex) {
    return knex.schema
        .createTable('wishlist', (table) => {
            table.increments('id').primary();
            table.integer('user_id').unsigned().notNullable();
            table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

            table.unique('user_id', { indexName: 'wishlist_user_unique' });

            table.foreign('user_id', 'fk_wishlist_user')
                .references('id').inTable('users')
                .onDelete('CASCADE')
                .onUpdate('CASCADE');
        })
        .then(() => knex.schema.createTable('wishlist_items', (table) => {
            table.increments('id').primary();
            table.integer('wishlist_id').unsigned().notNullable();
            table.integer('product_id').unsigned().notNullable();
            table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

            table.unique(['wishlist_id', 'product_id'], { indexName: 'unique_wishlist_product' });
            table.index('product_id', 'idx_wishlist_items_product');

            table.foreign('wishlist_id', 'fk_wishlist_items_wishlist')
                .references('id').inTable('wishlist')
                .onDelete('CASCADE')
                .onUpdate('CASCADE');
            table.foreign('product_id', 'fk_wishlist_items_product')
                .references('id').inTable('products')
                .onDelete('CASCADE')
                .onUpdate('CASCADE');
        }));
};

exports.down = function down(knex) {
    return knex.schema
        .dropTableIfExists('wishlist_items')
        .then(() => knex.schema.dropTableIfExists('wishlist'));
};