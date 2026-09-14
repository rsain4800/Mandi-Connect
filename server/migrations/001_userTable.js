/**
 * users — single-admin + customer accounts.
 * role='admin' identifies the one business owner/operator account;
 * everyone else is role='customer'. There is intentionally no 'seller' role
 * (MandiConnect is single-seller — see project rules).
 */
exports.up = function up(knex) {
    return knex.schema.createTable('users', (table) => {
        table.increments('id').primary();
        table.string('full_name', 100).notNullable();
        table.string('email', 150).notNullable();
        table.string('phone', 20).nullable();
        table.string('profile_image', 255).nullable();
        table.string('password', 255).notNullable();
        table.enu('role', ['customer', 'admin'], { useNative: true, enumName: 'users_role_enum' }).notNullable().defaultTo('customer');
        // Soft-deactivation flag — customers are deactivated, never hard-deleted,
        // so historical orders placed by them remain intact (see orders FK).
        table.boolean('is_active').notNullable().defaultTo(true);
        table.string('reset_password_token', 255).nullable();
        table.datetime('reset_password_expire').nullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
        table.unique('email', { indexName: 'users_email_unique' });
        table.index('role', 'idx_user_role');
        table.index('reset_password_token', 'idx_user_reset_token');
    }).then(() => (
        // ON UPDATE CURRENT_TIMESTAMP isn't expressible via the knex builder,
        // so it's applied with a raw ALTER right after table creation.
        knex.raw(
            'ALTER TABLE `users` MODIFY `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
        )
    ));
};

exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('users');
};