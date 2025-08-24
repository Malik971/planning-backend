// migrations/002_create_events.js
exports.up = function(knex) {
  return knex.schema.createTable('events', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('title').notNullable();
    table.timestamp('start_time').notNullable();
    table.timestamp('end_time').notNullable();
    table.enum('team', ['bar', 'animation', 'reception']).notNullable();
    table.string('animator').nullable(); // Nom de l'animateur
    table.string('color').nullable(); // Couleur hex pour l'affichage
    table.text('description').nullable();
    table.json('metadata').defaultTo('{}'); // Données supplémentaires
    
    // Traçabilité
    table.string('created_by').notNullable(); // Firebase UID
    table.string('last_modified_by').nullable(); // Firebase UID
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Index pour performances
    table.index(['team', 'start_time']);
    table.index('created_by');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('events');
};