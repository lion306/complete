#!/usr/bin/env node
/**
 * Startup script: runs migrations, seeds, then starts the server.
 */
const { execSync } = require('child_process');
const path = require('path');

function run(label, script) {
  console.log(`\n=== ${label} ===`);
  try {
    execSync(`node ${script}`, {
      cwd: path.resolve(__dirname),
      stdio: 'inherit',
      env: process.env,
    });
    console.log(`=== ${label} OK ===\n`);
  } catch (err) {
    console.error(`=== ${label} FAILED (continuing...) ===\n`);
  }
}

run('Migrations', 'migrations/run.js');
run('Seed', 'migrations/seed.js');

// Start the actual server
require('./src/server');
