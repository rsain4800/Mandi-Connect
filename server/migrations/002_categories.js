/**
 * categories — product categories, managed by the single admin.
 * Deletion is always a soft deactivation (categoryController.deleteCategory
 * sets is_active = 0) so that products already assigned to a category never
 * lose their category reference and historical order_items (which snapshot
 * product_name/sku directly, not category) are unaffected either way.
 *
 * NOTE on migration ordering: this project's very first migration
 * (../migrations/userTable.js) predates the timestamped-migration
 * convention and has no numeric/date prefix, so it is NOT necessarily first
 * in filename sort order (Knex runs migrations in filename order). Every
 * migration added from this point forward is prefixed `v0NN_` — the
 * leading "v" (0x76) sorts after the "u" in "userTable.js" (0x75), which
 * guarantees these all run after it regardless of whether userTable.js has
 * already been applied in an existing environment. Do not rename
 * userTable.js — renaming an already-applied migration file breaks Knex's
 * bookkeeping in knex_migrations. See PHASE1_DB_AUDIT.md for details.
 */
exports.up = function up(knex) {
    return knex.schema.createTable('categories', (table) => {
        table.increments('id').primary();
        table.string('name', 100).notNullable();
        table.string('slug', 120).notNullable();
        table.text('description').nullable();
        table.string('image', 255).nullable();
        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.unique('name', { indexName: 'categories_name_unique' });
        table.unique('slug', { indexName: 'categories_slug_unique' });
        table.index('is_active', 'idx_category_active');
    }).then(() => (
        knex.raw(
            'ALTER TABLE `categories` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('categories');
};