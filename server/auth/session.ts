/**
 * Server-side sessions.
 *
 * A random token is returned to the browser once; only its SHA-256 hash is
 * stored, so a database leak cannot be replayed as a login.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../db/pool';

export const SESSION_COOKIE = 'lodge_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantStatus: string | null;
  currency: string;
  timezone: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
}

interface SessionRow {
  id: string;
  expires_at: Date;
  user_id: string;
  email: string;
  display_name: string;
  status: string;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_status: string | null;
  currency: string | null;
  timezone: string | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await getPool().query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), userId, hashToken(token), expiresAt, meta.ip ?? null, meta.userAgent ?? null]
  );
  await getPool().query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);

  return { token, expiresAt };
}

export async function resolveSession(token: string): Promise<AuthUser | null> {
  if (!token) return null;

  const result = await getPool().query<SessionRow>(
    `SELECT s.id, s.expires_at, s.user_id,
            u.email, u.display_name, u.status,
            u.tenant_id, t.name AS tenant_name, t.status AS tenant_status,
            t.currency, t.timezone
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()`,
    [hashToken(token)]
  );

  const row = result.rows[0];
  if (!row) return null;
  if (row.status !== 'ACTIVE') return null;
  if (row.tenant_id && row.tenant_status !== 'ACTIVE') return null;

  const permissionRows = await getPool().query<{ permission_key: string }>(
    `SELECT DISTINCT rp.permission_key
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = $1`,
    [row.user_id]
  );
  const roleRows = await getPool().query<{ key: string; branch_id: string | null }>(
    `SELECT r.key, ur.branch_id
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1`,
    [row.user_id]
  );

  await getPool().query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.id]);

  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantStatus: row.tenant_status,
    currency: row.currency ?? 'TZS',
    timezone: row.timezone ?? 'Africa/Dar_es_Salaam',
    roles: [...new Set(roleRows.rows.map((r) => r.key))],
    permissions: [...new Set(permissionRows.rows.map((r) => r.permission_key))],
    branchIds: [
      ...new Set(
        roleRows.rows.map((r) => r.branch_id).filter((id): id is string => Boolean(id))
      ),
    ],
  };
}

export async function revokeSession(token: string): Promise<void> {
  if (!token) return;
  await getPool().query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export function sessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}
