/**
 * product_images — extra gallery images for a product (thumbnail itself
 * lives on products.thumbnail). Purely presentational, not a historical
 * business record, so CASCADE on product deletion is correct — though in
 * practice products are never hard-deleted (see v002_products.js), only
 * deactivated via is_active.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('product_images', (table) => {
        table.increments('id').primary();
        table.integer('product_id').unsigned().notNullable();
        table.string('image_url', 255).notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

        table.index('product_id', 'idx_product_images_product');

        table.foreign('product_id', 'fk_product_images_product')
            .references('id').inTable('products')
            .onDelete('CASCADE')
            .onUpdate('CASCADE');
    });
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('product_images');
};