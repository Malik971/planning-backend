// src/config/database.js
const knex = require('knex');
const config = require('./index');

const db = knex({
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    ssl: config.env === 'production' ? { rejectUnauthorized: false } : false
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './seeds'
  }
});

// Test de connexion
db.raw('SELECT 1')
  .then(() => {
    console.log('✅ Connexion PostgreSQL établie');
  })
  .catch(err => {
    console.error('❌ Erreur connexion PostgreSQL:', err.message);
    process.exit(1);
  });

module.exports = db;

// knexfile.js (racine du projet)
require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    },
    migrations: {
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    }
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './migrations'
    },
    ssl: { rejectUnauthorized: false }
  }
};