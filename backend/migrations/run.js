#!/usr/bin/env node
/**
 * Migration Runner
 * Usage: node migrations/run.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const db = require('../src/config/database');

async function runMigrations() {
  console.log('Running DMS migrations...');
  try {
    // Create migrations tracking table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);

    const migDir = path.join(__dirname);
    const files = fs.readdirSync(migDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await db.raw(
        'SELECT id FROM schema_migrations WHERE filename = ?', [file]
      );
      if (rows.length > 0) {
        console.log(`  SKIP ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
      await db.raw(sql);
      await db.raw('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      console.log(`  OK   ${file}`);
    }
    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

runMigrations();
