/**
 * Tenants, branches, staff accounts and roles.
 *
 * Every read/write is tenant-scoped. Creating a tenant provisions a default
 * branch, the system role templates and an owner account atomically.
 */

import { randomUUID, randomBytes } from 'node:crypto';
import { PoolClient } from 'pg';
import { getPool, withTransaction } from './pool';
import { RoomDbError } from './errors';
import { BUSINESS_ROLE_TEMPLATES } from '../auth/permissions';
import { hashPassword } from '../auth/password';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  country: string;
  currency: string;
  timezone: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  isDefault: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffUser {
  id: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  phone: string | null;
  status: string;
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
}

function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function mapTenant(row: any): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    legalName: row.legal_name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    currency: row.currency,
    timezone: row.timezone,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBranch(row: any): Branch {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    code: row.code,
    address: row.address,
    city: row.city,
    phone: row.phone,
    isDefault: row.is_default,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTenants(): Promise<Array<Tenant & { branchCount: number; roomCount: number; userCount: number }>> {
  const result = await getPool().query(
    `SELECT t.*,
            (SELECT count(*)::int FROM branches b WHERE b.tenant_id = t.id) AS branch_count,
            (SELECT count(*)::int FROM rooms r WHERE r.tenant_id = t.id AND r.archived_at IS NULL) AS room_count,
            (SELECT count(*)::int FROM users u WHERE u.tenant_id = t.id AND u.status = 'ACTIVE') AS user_count
       FROM tenants t
      ORDER BY t.created_at DESC`
  );
  return result.rows.map((row) => ({
    ...mapTenant(row),
    branchCount: row.branch_count,
    roomCount: row.room_count,
    userCount: row.user_count,
  }));
}

export async function getTenant(id: string): Promise<Tenant> {
  const result = await getPool().query('SELECT * FROM tenants WHERE id = $1', [id]);
  if (!result.rows[0]) {
    throw new RoomDbError('ROOM_NOT_FOUND', 'Business not found.');
  }
  return mapTenant(result.rows[0]);
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string;
  currency?: string;
  timezone?: string;
  branchName?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

async function seedRoles(client: PoolClient, tenantId: string): Promise<void> {
  for (const template of BUSINESS_ROLE_TEMPLATES) {
    const roleId = `role-${tenantId}-${template.key}`;
    await client.query(
      `INSERT INTO roles (id, tenant_id, key, name, description, is_system)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT DO NOTHING`,
      [roleId, tenantId, template.key, template.name, template.description]
    );
    for (const permission of template.permissions) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_key)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, permission]
      );
    }
  }
}

export async function createTenant(input: CreateTenantInput): Promise<{
  tenant: Tenant;
  branch: Branch;
  ownerUserId: string;
}> {
  const passwordHash = await hashPassword(input.ownerPassword);

  return withTransaction(async (client) => {
    const tenantId = newId('ten');
    const branchId = newId('br');
    const userId = newId('usr');

    let tenantRow;
    try {
      tenantRow = await client.query(
        `INSERT INTO tenants
           (id, name, slug, legal_name, email, phone, country, currency, timezone, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')
         RETURNING *`,
        [
          tenantId,
          input.name,
          input.slug.toLowerCase(),
          input.legalName ?? null,
          input.email ?? null,
          input.phone ?? null,
          input.country ?? 'Tanzania',
          (input.currency ?? 'TZS').toUpperCase(),
          input.timezone ?? 'Africa/Dar_es_Salaam',
        ]
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new RoomDbError('DUPLICATE_CATEGORY_NAME', 'That business slug is already registered.');
      }
      throw error;
    }

    const branchRow = await client.query(
      `INSERT INTO branches (id, tenant_id, name, code, is_default, status)
       VALUES ($1, $2, $3, 'MAIN', true, 'ACTIVE')
       RETURNING *`,
      [branchId, tenantId, input.branchName ?? 'Main Branch']
    );

    await seedRoles(client, tenantId);

    let userRow;
    try {
      userRow = await client.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, display_name, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         RETURNING *`,
        [userId, tenantId, input.ownerEmail.toLowerCase(), passwordHash, input.ownerName]
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new RoomDbError('DUPLICATE_CATEGORY_NAME', 'That email address is already registered.');
      }
      throw error;
    }

    await client.query(
      `INSERT INTO user_roles (user_id, role_id, branch_id)
       VALUES ($1, $2, NULL)`,
      [userId, `role-${tenantId}-OWNER`]
    );

    await client.query(
      `INSERT INTO tenant_features (tenant_id, feature_key, enabled)
       VALUES ($1, 'core', true), ($1, 'cctv', true)
       ON CONFLICT DO NOTHING`,
      [tenantId]
    );

    return {
      tenant: mapTenant(tenantRow.rows[0]),
      branch: mapBranch(branchRow.rows[0]),
      ownerUserId: userRow.rows[0].id,
    };
  });
}

export async function updateTenant(
  id: string,
  patch: Partial<{
    name: string | null;
    legalName: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
    currency: string | null;
    timezone: string | null;
    status: string | null;
  }>
): Promise<Tenant> {
  const result = await getPool().query(
    `UPDATE tenants SET
       name = COALESCE($2, name),
       legal_name = COALESCE($3, legal_name),
       email = COALESCE($4, email),
       phone = COALESCE($5, phone),
       country = COALESCE($6, country),
       currency = COALESCE($7, currency),
       timezone = COALESCE($8, timezone),
       status = COALESCE($9, status),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.name ?? null,
      patch.legalName ?? null,
      patch.email ?? null,
      patch.phone ?? null,
      patch.country ?? null,
      patch.currency ? patch.currency.toUpperCase() : null,
      patch.timezone ?? null,
      patch.status ?? null,
    ]
  );
  if (!result.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Business not found.');
  return mapTenant(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export async function listBranches(tenantId: string): Promise<Branch[]> {
  const result = await getPool().query(
    'SELECT * FROM branches WHERE tenant_id = $1 ORDER BY is_default DESC, name ASC',
    [tenantId]
  );
  return result.rows.map(mapBranch);
}

export async function getDefaultBranch(tenantId: string): Promise<Branch | null> {
  const result = await getPool().query(
    'SELECT * FROM branches WHERE tenant_id = $1 ORDER BY is_default DESC, created_at ASC LIMIT 1',
    [tenantId]
  );
  return result.rows[0] ? mapBranch(result.rows[0]) : null;
}

export async function createBranch(
  tenantId: string,
  input: { name: string; code?: string | null; address?: string | null; city?: string | null; phone?: string | null; isDefault?: boolean }
): Promise<Branch> {
  return withTransaction(async (client) => {
    if (input.isDefault) {
      await client.query('UPDATE branches SET is_default = false WHERE tenant_id = $1', [tenantId]);
    }
    const result = await client.query(
      `INSERT INTO branches (id, tenant_id, name, code, address, city, phone, is_default, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
       RETURNING *`,
      [newId('br'), tenantId, input.name, input.code ?? null, input.address ?? null, input.city ?? null, input.phone ?? null, Boolean(input.isDefault)]
    );
    return mapBranch(result.rows[0]);
  });
}

export async function updateBranch(
  tenantId: string,
  id: string,
  patch: Partial<Pick<Branch, 'name' | 'code' | 'address' | 'city' | 'phone' | 'isDefault' | 'status'>>
): Promise<Branch> {
  return withTransaction(async (client) => {
    if (patch.isDefault === true) {
      await client.query('UPDATE branches SET is_default = false WHERE tenant_id = $1', [tenantId]);
    }
    const result = await client.query(
      `UPDATE branches SET
         name = COALESCE($3, name),
         code = COALESCE($4, code),
         address = COALESCE($5, address),
         city = COALESCE($6, city),
         phone = COALESCE($7, phone),
         is_default = COALESCE($8, is_default),
         status = COALESCE($9, status),
         updated_at = now()
       WHERE id = $2 AND tenant_id = $1
       RETURNING *`,
      [
        tenantId, id, patch.name ?? null, patch.code ?? null, patch.address ?? null,
        patch.city ?? null, patch.phone ?? null, patch.isDefault ?? null, patch.status ?? null,
      ]
    );
    if (!result.rows[0]) throw new RoomDbError('CATEGORY_NOT_FOUND', 'Branch not found.');
    return mapBranch(result.rows[0]);
  });
}

// ---------------------------------------------------------------------------
// Staff and roles
// ---------------------------------------------------------------------------

export async function listStaff(tenantId: string): Promise<StaffUser[]> {
  const result = await getPool().query(
    `SELECT u.id, u.tenant_id, u.email, u.display_name, u.phone, u.status, u.last_login_at, u.created_at,
            COALESCE(array_agg(DISTINCT r.key) FILTER (WHERE r.key IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.tenant_id = $1
      GROUP BY u.id
      ORDER BY u.created_at DESC`,
    [tenantId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    displayName: row.display_name,
    phone: row.phone,
    status: row.status,
    roles: row.roles ?? [],
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  }));
}

export async function listRoles(tenantId: string): Promise<Role[]> {
  const result = await getPool().query(
    `SELECT r.id, r.key, r.name, r.description,
            COALESCE(array_agg(rp.permission_key) FILTER (WHERE rp.permission_key IS NOT NULL), '{}') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.tenant_id = $1
      GROUP BY r.id
      ORDER BY r.name`,
    [tenantId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    permissions: row.permissions ?? [],
  }));
}

export async function createStaff(
  tenantId: string,
  input: { email: string; displayName: string; password: string; phone?: string | null; roleKey: string; branchId?: string | null }
): Promise<StaffUser> {
  const passwordHash = await hashPassword(input.password);

  return withTransaction(async (client) => {
    const role = await client.query(
      'SELECT id FROM roles WHERE tenant_id = $1 AND key = $2',
      [tenantId, input.roleKey]
    );
    if (!role.rows[0]) throw new RoomDbError('INVALID_ROOM_DATA', 'Unknown role for this business.');

    let inserted;
    try {
      inserted = await client.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, display_name, phone, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
         RETURNING *`,
        [newId('usr'), tenantId, input.email.toLowerCase(), passwordHash, input.displayName, input.phone ?? null]
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new RoomDbError('DUPLICATE_CATEGORY_NAME', 'That email address is already registered.');
      }
      throw error;
    }

    await client.query(
      'INSERT INTO user_roles (user_id, role_id, branch_id) VALUES ($1, $2, $3)',
      [inserted.rows[0].id, role.rows[0].id, input.branchId ?? null]
    );

    return {
      id: inserted.rows[0].id,
      tenantId,
      email: inserted.rows[0].email,
      displayName: inserted.rows[0].display_name,
      phone: inserted.rows[0].phone,
      status: inserted.rows[0].status,
      roles: [input.roleKey],
      lastLoginAt: null,
      createdAt: inserted.rows[0].created_at,
    };
  });
}

export async function updateStaff(
  tenantId: string,
  userId: string,
  patch: { displayName?: string; phone?: string | null; status?: string; roleKey?: string }
): Promise<StaffUser> {
  return withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE users SET
         display_name = COALESCE($3, display_name),
         phone = COALESCE($4, phone),
         status = COALESCE($5, status),
         updated_at = now()
       WHERE id = $2 AND tenant_id = $1
       RETURNING *`,
      [tenantId, userId, patch.displayName ?? null, patch.phone ?? null, patch.status ?? null]
    );
    if (!updated.rows[0]) throw new RoomDbError('CATEGORY_NOT_FOUND', 'Staff member not found.');

    if (patch.roleKey) {
      const role = await client.query('SELECT id FROM roles WHERE tenant_id = $1 AND key = $2', [
        tenantId,
        patch.roleKey,
      ]);
      if (!role.rows[0]) throw new RoomDbError('INVALID_ROOM_DATA', 'Unknown role for this business.');
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      await client.query('INSERT INTO user_roles (user_id, role_id, branch_id) VALUES ($1, $2, NULL)', [
        userId,
        role.rows[0].id,
      ]);
    }

    const roles = await client.query(
      `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [userId]
    );
    return {
      id: updated.rows[0].id,
      tenantId,
      email: updated.rows[0].email,
      displayName: updated.rows[0].display_name,
      phone: updated.rows[0].phone,
      status: updated.rows[0].status,
      roles: roles.rows.map((r) => r.key),
      lastLoginAt: updated.rows[0].last_login_at,
      createdAt: updated.rows[0].created_at,
    };
  });
}

/** Used only by the bootstrap CLI. */
export async function createPlatformUser(input: {
  email: string;
  displayName: string;
  password: string;
  roleKey: 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT';
}): Promise<string> {
  const passwordHash = await hashPassword(input.password);
  return withTransaction(async (client) => {
    const role = await client.query('SELECT id FROM roles WHERE tenant_id IS NULL AND key = $1', [
      input.roleKey,
    ]);
    if (!role.rows[0]) throw new Error(`Platform role ${input.roleKey} is missing.`);

    const user = await client.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, display_name, status)
       VALUES ($1, NULL, $2, $3, $4, 'ACTIVE')
       RETURNING id`,
      [newId('usr'), input.email.toLowerCase(), passwordHash, input.displayName]
    );
    await client.query('INSERT INTO user_roles (user_id, role_id, branch_id) VALUES ($1, $2, NULL)', [
      user.rows[0].id,
      role.rows[0].id,
    ]);
    return user.rows[0].id as string;
  });
}

export async function findUserByEmail(email: string): Promise<{
  id: string;
  tenantId: string | null;
  passwordHash: string;
  status: string;
  tenantStatus: string | null;
} | null> {
  const result = await getPool().query(
    `SELECT u.id, u.tenant_id, u.password_hash, u.status, t.status AS tenant_status
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE lower(btrim(u.email)) = lower(btrim($1))
      LIMIT 1`,
    [email]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    passwordHash: row.password_hash,
    status: row.status,
    tenantStatus: row.tenant_status,
  };
}

export function generateTemporaryPassword(): string {
  return randomBytes(9).toString('base64url');
}
