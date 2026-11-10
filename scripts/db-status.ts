/**
 * Diagnostic CLI: npm run db:status
 * Prints applied migrations and row counts for the core ERP tables.
 */

import 'dotenv/config';
import { closePool, getPool } from '../server/db/pool';

async function main(): Promise<void> {
  const pool = getPool();

  const migrations = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  console.log('Migrations:');
  for (const row of migrations.rows) console.log(`  - ${row.filename}`);

  const tables = [
    'tenants',
    'branches',
    'users',
    'roles',
    'permissions',
    'room_categories',
    'rooms',
    'guests',
    'reservations',
    'guest_stays',
    'housekeeping_tasks',
    'invoices',
    'payments',
    'cameras',
    'cctv_alerts',
  ];

  console.log('Row counts:');
  for (const table of tables) {
    const result = await pool.query(`SELECT count(*)::int AS count FROM ${table}`);
    console.log(`  ${table.padEnd(24)} ${result.rows[0].count}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
