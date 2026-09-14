/**
 * Phase 3 — wholesale/bulk product fields + price tiers.
 *
 * Adds the fields the actual business model needs (single seller, bulk
 * sales within Rajasthan) on top of the existing `products` table, and a
 * new `product_price_tiers` table for quantity-based wholesale pricing.
 *
 * Naming note: `stock_quantity` is NOT renamed to `available_stock` here.
 * That column is already read/written by cart, order, payment, wishlist,
 * and admin-dashboard queries across the codebase; a physical rename would
 * touch a large surface area for no functional gain. Instead the API layer
 * (productController) now aliases it as `available_stock` in every response
 * so the wholesale terminology from the spec is what clients/admin UI see,
 * while `stock_quantity` remains the column name at the DB layer. See
 * PHASE3_WHOLESALE.md for the full rationale.
 *
 * Filename note: Knex runs migrations in filename order, and this project's
 * migrations have no numeric prefix (see categories.js's migration-ordering
 * comment) — they rely on plain alphabetical filename sort. This file is
 * named so that "productsWholesaleUpgrade.js" sorts after both
 * "product_image.js" and "products.js" ('.' in "products.js" sorts before
 * any letter), guaranteeing the `products` table already exists before this
 * migration's ALTER TABLE runs.
 */
exports.up = async function up(knex) {
    await knex.schema.alterTable('products', (table) => {
        // Wholesale ordering rules
        table.integer('minimum_order_quantity').unsigned().notNullable().defaultTo(1);
        table.integer('maximum_order_quantity').unsigned().nullable();

        // Wholesale provenance/quality metadata (all optional — a product
        // that doesn't need them, e.g. packaged atta, can leave them null)
        table.string('grade', 50).nullable();
        table.string('quality', 50).nullable();
        table.string('origin', 150).nullable();
        table.string('origin_district', 100).nullable();
        table.string('origin_mandi', 150).nullable();
    });

    // Widen the unit enum to the full wholesale unit set (adds 'ton'; 'bag'
    // was already added in migrations/products.js). Recreated via raw SQL
    // since Knex can't ALTER an existing native ENUM's value list directly.
    await knex.raw(
        "ALTER TABLE `products` MODIFY `unit` ENUM('kg','gram','quintal','ton','piece','dozen','crate','box','bag') NOT NULL DEFAULT 'kg'"
    );

    await knex.schema.alterTable('products', (table) => {
        table.check('minimum_order_quantity >= 1', [], 'chk_products_moq_positive');
        table.check(
            'maximum_order_quantity IS NULL OR maximum_order_quantity >= minimum_order_quantity',
            [],
            'chk_products_max_oq_ge_moq'
        );
    });

    // Wholesale price tiers — a separate table so the existing single-price
    // system (products.price / products.discount_price) keeps working
    // untouched for any product that doesn't define tiers.
    await knex.schema.createTable('product_price_tiers', (table) => {
        table.increments('id').primary();
        table.integer('product_id').unsigned().notNullable();
        table.integer('min_quantity').unsigned().notNullable();
        table.integer('max_quantity').unsigned().nullable(); // null = open-ended ("51+")
        table.decimal('price', 10, 2).notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.index('product_id', 'idx_price_tiers_product');

        // Tiers are derived pricing data, not a historical record like an
        // order — safe to cascade-delete if a product is ever hard-deleted
        // (in practice products are only deactivated, never hard-deleted;
        // see productController.deleteProduct).
        table.foreign('product_id', 'fk_price_tiers_product')
            .references('id').inTable('products')
            .onDelete('CASCADE')
            .onUpdate('CASCADE');

        table.check('?? >= 1', ['min_quantity'], 'chk_price_tiers_min_qty_positive');
        table.check(
            '?? IS NULL OR ?? >= ??',
            ['max_quantity', 'max_quantity', 'min_quantity'],
            'chk_price_tiers_max_ge_min'
        );
        table.check('?? >= 0', ['price'], 'chk_price_tiers_price_nonneg');
    }).then(() => (
        knex.raw(
            'ALTER TABLE `product_price_tiers` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('product_price_tiers');

    await knex.raw(
        "ALTER TABLE `products` MODIFY `unit` ENUM('kg','gram','quintal','piece','dozen','crate','box','bag') NOT NULL DEFAULT 'kg'"
    );

    await knex.schema.alterTable('products', (table) => {
        table.dropChecks(['chk_products_moq_positive', 'chk_products_max_oq_ge_moq']);
        table.dropColumn('minimum_order_quantity');
        table.dropColumn('maximum_order_quantity');
        table.dropColumn('grade');
        table.dropColumn('quality');
        table.dropColumn('origin');
        table.dropColumn('origin_district');
        table.dropColumn('origin_mandi');
    });
};