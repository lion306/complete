const knex = require('knex');
require('dotenv').config();

const isSupabase = process.env.DB_HOST && process.env.DB_HOST.includes('supabase.co');
const sslEnabled = process.env.DB_SSL === 'true' || isSupabase;

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'dms_autohaus',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  },
  pool: {
    min: 2,
    max: 20,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 600000,
  },
  acquireConnectionTimeout: 60000,
});

module.exports = db;
