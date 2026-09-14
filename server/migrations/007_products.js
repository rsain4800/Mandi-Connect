/**
 * products — the single seller's catalog.
 *
 * FK behaviour (Phase 1 audit finding):
 * schema.sql previously had `category_id ... ON DELETE CASCADE`, which
 * would silently delete every product in a category the moment that
 * category row was removed — and any of those products' order_items would
 * then cascade-delete too (see v013_order_items.js), destroying historical
 * order data. categoryController never actually issues a hard DELETE
 * (deleteCategory only sets is_active = 0), so this was a latent footgun
 * rather than an active bug, but it violates "never lose historical
 * records" outright. Fixed here to RESTRICT: the database will now refuse
 * to delete a category that still has products, regardless of what the
 * application layer does.
 *
 * `unit` enum: seeders/seed.js seeds a "10 kg" wheat-flour product with
 * unit: 'bag', which is not present in the original schema.sql enum
 * ('kg','gram','quintal','piece','dozen','crate','box') — inserting it
 * would fail with ER_TRUNCATED_WRONG_VALUE / ER_WARN_DATA_OUT_OF_RANGE.
 * 'bag' is a normal wholesale unit for this business (atta, grains), so it
 * is added here rather than changing the seed data.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('products', (table) => {
        table.increments('id').primary();
        table.string('name', 150).notNullable();
        table.string('slug', 180).notNullable();
        table.string('sku', 50).notNullable();
        table.text('description').nullable();
        table.integer('category_id').unsigned().notNullable();
        table.string('subcategory', 100).nullable();
        table.string('brand', 100).notNullable().defaultTo('Local Mandi');
        table.decimal('price', 10, 2).notNullable();
        table.decimal('discount_price', 10, 2).nullable();
        table.integer('discount_percentage').notNullable().defaultTo(0);
        table.integer('stock_quantity').notNullable().defaultTo(0);
        table.enu(
            'unit',
            ['kg', 'gram', 'quintal', 'piece', 'dozen', 'crate', 'box', 'bag'],
            { useNative: true, enumName: 'products_unit_enum' }
        ).notNullable().defaultTo('kg');
        table.string('weight', 50).notNullable().defaultTo('1 kg');
        table.string('thumbnail', 255).nullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.boolean('is_featured').notNullable().defaultTo(false);
        table.boolean('is_best_seller').notNullable().defaultTo(false);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.unique('slug', { indexName: 'products_slug_unique' });
        table.unique('sku', { indexName: 'products_sku_unique' });
        table.index('category_id', 'idx_product_category');
        table.index('is_featured', 'idx_product_featured');
        table.index('is_best_seller', 'idx_product_best_seller');
        // Supports getProducts()/getSearchSuggestions(), which always filter
        // on is_active = 1 first before applying any other filter.
        table.index('is_active', 'idx_product_active');

        table.foreign('category_id', 'fk_products_category')
            .references('id').inTable('categories')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');

        table.check('?? >= 0', ['price'], 'chk_products_price_nonneg');
        table.check('?? >= 0', ['discount_price'], 'chk_products_discount_price_nonneg');
        table.check('?? >= 0', ['stock_quantity'], 'chk_products_stock_nonneg');
        table.check(
            '?? BETWEEN 0 AND 100',
            ['discount_percentage'],
            'chk_products_discount_pct_range'
        );
    }).then(() => (
        knex.raw(
            'ALTER TABLE `products` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('products');
};