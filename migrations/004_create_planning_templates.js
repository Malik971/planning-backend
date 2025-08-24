// migrations/004_create_planning_templates.js
exports.up = function(knex) {
  return knex.schema.createTable('planning_templates', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.text('description').nullable();
    table.enum('team', ['bar', 'animation', 'reception']).notNullable();
    table.json('template_events').notNullable(); // Structure des événements
    table.string('created_by').notNullable();
    table.boolean('active').defaultTo(true);
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('planning_templates');
};