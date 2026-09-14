/**
 * reviews — one verified-buyer review per (product, user), enforced by the
 * existing unique_user_product_review constraint plus the
 * ON DUPLICATE KEY UPDATE upsert already used in reviewController.addReview.
 * product_id and user_id both use RESTRICT: reviews are real customer
 * content tied to a specific historical purchase relationship and should
 * not silently vanish if either row is ever removed (defense in depth —
 * no hard-delete endpoint exists for either products or users today).
 */
exports.up = function up(knex) {
    return knex.schema.createTable('reviews', (table) => {
        table.increments('id').primary();
        table.integer('product_id').unsigned().notNullable();
        table.integer('user_id').unsigned().notNullable();
        table.integer('rating').notNullable();
        table.text('comment').nullable();
        table.boolean('is_approved').notNullable().defaultTo(true);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        table.unique(['product_id', 'user_id'], { indexName: 'unique_user_product_review' });
        table.index('user_id', 'idx_reviews_user');
        table.index('is_approved', 'idx_reviews_approved');

        table.foreign('product_id', 'fk_reviews_product')
            .references('id').inTable('products')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');
        table.foreign('user_id', 'fk_reviews_user')
            .references('id').inTable('users')
            .onDelete('RESTRICT')
            .onUpdate('CASCADE');

        table.check('?? BETWEEN 1 AND 5', ['rating'], 'chk_reviews_rating_range');
    }).then(() => (
        knex.raw(
            'ALTER TABLE `reviews` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('reviews');
};