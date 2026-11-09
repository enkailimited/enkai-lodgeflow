/**
 * ENKAI LODGEFLOW — GATE 2.0
 * PostgreSQL connection pool.
 *
 * Configuration is server-only: `DATABASE_URL` is never exposed through a
 * `VITE_*` variable, so credentials cannot end up in the browser bundle.
 * The pool is created lazily so the CCTV/Gemini server still boots and works
 * when the database is not configured or temporarily unreachable.
 */

import 'dotenv/config';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { RoomDbError } from './errors';

let pool: Pool | null = null;

export function getDatabaseUrl(): string | null {
  const value = (process.env.DATABASE_URL ?? '').trim();
  return value.length > 0 ? value : null;
}

/**
 * Neon exposes a pooled URL for application traffic and a direct URL for
 * session-level work. Schema migrations take advisory locks and run DDL, which
 * must not go through PgBouncer, so prefer the unpooled URL when it exists.
 */
export function getMigrationDatabaseUrl(): string | null {
  const direct = (process.env.DATABASE_URL_UNPOOLED ?? '').trim();
  if (direct.length > 0) return direct;
  return getDatabaseUrl();
}

export function isPooledConnectionString(connectionString: string): boolean {
  try {
    return new URL(connectionString).hostname.includes('-pooler.');
  } catch {
    return connectionString.includes('-pooler.');
  }
}

export function isDatabaseConfigured(): boolean {
  return getDatabaseUrl() !== null;
}

/**
 * `PGSSL` values:
 *   unset / "disable" -> no TLS
 *   "require"         -> TLS with certificate verification
 *   "no-verify"       -> TLS without certificate verification (managed hosts)
 */
export function resolveSsl(): PoolConfig['ssl'] {
  const mode = (process.env.PGSSL ?? '').trim().toLowerCase();
  if (!mode || mode === 'disable') return undefined;
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

export function getPool(): Pool {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new RoomDbError(
      'DATABASE_UNAVAILABLE',
      'Room storage is not configured on this server (DATABASE_URL is missing).'
    );
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: resolveSsl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      // Managed PostgreSQL (Neon) can suspend an idle compute and take several
      // seconds to accept the first connection. A short 5 s timeout turned
      // ordinary cold starts into 500s, so this is configurable and generous.
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 20_000),
      keepAlive: true,
      application_name: 'enkai-lodgeflow',
    });

    // Without this listener an idle client error would crash the process.
    pool.on('error', (error) => {
      console.error('[room-db] idle client error:', error.message);
    });
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

export async function withTransaction<T>(
  run: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The transaction may already be aborted; the original error wins.
    }
    throw error;
  } finally {
    client.release();
  }
}
