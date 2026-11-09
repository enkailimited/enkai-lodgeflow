/**
 * ENKAI LODGEFLOW — GATE 2.0
 * Versioned SQL migration runner.
 *
 * Every `db/migrations/*.sql` file is applied exactly once, inside its own
 * transaction, in filename order. An advisory lock prevents two processes from
 * migrating the same database concurrently.
 */

import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { resolveSsl } from './pool';

const MIGRATION_LOCK_KEY = 728_394_001;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export function defaultMigrationsDir(): string {
  return path.resolve(process.cwd(), 'db', 'migrations');
}

export async function runMigrations(
  databaseUrl: string,
  migrationsDir: string = defaultMigrationsDir()
): Promise<MigrationResult> {
  if (!databaseUrl) {
    throw new Error('runMigrations requires a database URL.');
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: resolveSsl(),
    application_name: 'enkai-lodgeflow-migrate',
  });

  await client.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    const existing = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations'
    );
    const alreadyApplied = new Set(existing.rows.map((row) => row.filename));

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        skipped.push(file);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(
          `Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } catch {
      // Connection may already be closed; nothing to release.
    }
    await client.end();
  }

  return { applied, skipped };
}
