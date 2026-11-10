/**
 * Platform bootstrap CLI.
 *
 *   npm run db:bootstrap
 *
 * Creates the first platform administrator from environment variables:
 *
 *   PLATFORM_ADMIN_EMAIL
 *   PLATFORM_ADMIN_PASSWORD      (minimum 8 characters)
 *   PLATFORM_ADMIN_NAME          (optional)
 *
 * It is idempotent: if the email already exists the command reports it and
 * exits successfully without modifying the account.
 */

import 'dotenv/config';
import { getPool, closePool } from '../server/db/pool';
import { createPlatformUser, findUserByEmail } from '../server/db/tenantStore';
import { runMigrations } from '../server/db/migrate';
import { getMigrationDatabaseUrl } from '../server/db/pool';

async function main(): Promise<void> {
  const email = (process.env.PLATFORM_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? '';
  const displayName = (process.env.PLATFORM_ADMIN_NAME ?? 'Platform Administrator').trim();

  if (!email || !password) {
    console.error(
      'PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be set before running db:bootstrap.'
    );
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('PLATFORM_ADMIN_PASSWORD must be at least 8 characters long.');
    process.exitCode = 1;
    return;
  }

  const migrationUrl = getMigrationDatabaseUrl();
  if (migrationUrl) {
    const result = await runMigrations(migrationUrl);
    if (result.applied.length > 0) {
      console.log(`Applied ${result.applied.length} migration(s).`);
    }
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`Platform account ${email} already exists; nothing to do.`);
    return;
  }

  const userId = await createPlatformUser({
    email,
    displayName,
    password,
    roleKey: 'PLATFORM_ADMIN',
  });
  console.log(`Created platform administrator ${email} (${userId}).`);

  const check = await getPool().query(
    `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
    [userId]
  );
  console.log(`Assigned role(s): ${check.rows.map((row) => row.key).join(', ') || 'none'}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
