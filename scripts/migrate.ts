/**
 * CLI entry point:  npm run db:migrate
 *
 * Schema migrations run DDL and take a session advisory lock, so they use the
 * direct/unpooled connection when one is configured (`DATABASE_URL_UNPOOLED`).
 * Application traffic keeps using the pooled `DATABASE_URL`.
 */

import 'dotenv/config';
import { runMigrations } from '../server/db/migrate';
import { getMigrationDatabaseUrl, isPooledConnectionString } from '../server/db/pool';

async function main(): Promise<void> {
  const databaseUrl = getMigrationDatabaseUrl();
  if (!databaseUrl) {
    console.error(
      'DATABASE_URL is not set. Add it to .env (server-only) before running migrations.'
    );
    process.exitCode = 1;
    return;
  }

  if (isPooledConnectionString(databaseUrl) && !process.env.DATABASE_URL_UNPOOLED) {
    console.warn(
      'Warning: migrating over a pooled connection. Set DATABASE_URL_UNPOOLED (direct Neon URL) for reliable DDL and advisory locks.'
    );
  }

  const result = await runMigrations(databaseUrl);
  if (result.applied.length === 0) {
    console.log(`Database is up to date (${result.skipped.length} migration(s) already applied).`);
    return;
  }

  console.log(`Applied ${result.applied.length} migration(s):`);
  for (const file of result.applied) console.log(`  + ${file}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
