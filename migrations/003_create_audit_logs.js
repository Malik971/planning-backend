// migrations/003_create_audit_logs.js
exports.up = function(knex) {
  return knex.schema.createTable('audit_logs', function(table) {
    table.increments('id').primary();
    table.string('table_name').notNullable();
    table.string('record_id').notNullable();
    table.enum('action', ['CREATE', 'UPDATE', 'DELETE']).notNullable();
    table.string('user_uid').notNullable();
    table.json('old_values').nullable();
    table.json('new_values').nullable();
    table.string('ip_address').nullable();
    table.string('user_agent').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Index pour recherches
    table.index(['table_name', 'record_id']);
    table.index(['user_uid', 'created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('audit_logs');
};