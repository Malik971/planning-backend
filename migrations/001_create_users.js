// migrations/001_create_users.js
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.string('uid').primary(); // Firebase UID
    table.string('email').notNullable().unique();
    table.string('display_name');
    table.enum('role', ['admin', 'manager', 'staff']).defaultTo('staff');
    table.json('teams').defaultTo('[]'); // ['bar', 'animation', 'reception']
    table.boolean('active').defaultTo(true);
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};