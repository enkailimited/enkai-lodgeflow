/**
 * ENKAI LODGEFLOW — multi-tenant room inventory data access.
 *
 * Every query is scoped to a tenant (and optionally a branch). All SQL is
 * parameterized. Rooms are soft-deleted (`archived_at`) so historical stays and
 * reservations can never dangle.
 */

import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { Room, RoomCategory, RoomPricing, RoomStatus } from '../../src/types/room';
import { ValidCategoryInput, ValidRoomInput } from '../validation/rooms';
import { RoomDbError } from './errors';
import { getPool, withTransaction } from './pool';

export interface RoomScope {
  tenantId: string;
  branchId: string | null;
}

interface RoomRow {
  id: string;
  room_number: string;
  name: string | null;
  category_id: string;
  floor: string;
  capacity: number | string;
  status: string;
  description: string | null;
  hourly_rate: string | null;
  daily_rate: string | null;
  overnight_rate: string | null;
  currency: string;
  pricing_updated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

const ROOM_COLUMNS = `
  id, room_number, name, category_id, floor, capacity, status, description,
  hourly_rate, daily_rate, overnight_rate, currency, pricing_updated_at,
  created_at, updated_at
`;

const CATEGORY_COLUMNS = 'id, name, description, created_at, updated_at';

function rateToNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRoom(row: RoomRow): Room {
  const pricing: RoomPricing = {
    hourlyRate: rateToNumber(row.hourly_rate),
    dailyRate: rateToNumber(row.daily_rate),
    overnightRate: rateToNumber(row.overnight_rate),
    currency: 'TZS',
  };

  return {
    id: row.id,
    roomNumber: row.room_number,
    name: row.name,
    categoryId: row.category_id,
    floor: row.floor,
    capacity: Number(row.capacity),
    status: row.status as RoomStatus,
    description: row.description,
    pricing,
    pricingUpdatedAt: row.pricing_updated_at ? row.pricing_updated_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapCategory(row: CategoryRow): RoomCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Translate PostgreSQL constraint/connection failures into typed domain errors. */
function mapPostgresError(error: unknown): never {
  const pgError = error as { code?: string; constraint?: string };

  if (pgError.code === '23505') {
    if (
      pgError.constraint === 'rooms_room_number_unique' ||
      pgError.constraint === 'rooms_tenant_branch_number_unique'
    ) {
      throw new RoomDbError(
        'DUPLICATE_ROOM_NUMBER',
        'A room with this number already exists in this branch.',
        'roomNumber'
      );
    }
    if (
      pgError.constraint === 'room_categories_name_unique' ||
      pgError.constraint === 'room_categories_tenant_name_unique'
    ) {
      throw new RoomDbError(
        'DUPLICATE_CATEGORY_NAME',
        'A category with this name already exists.',
        'name'
      );
    }
  }

  if (pgError.code === '23503') {
    throw new RoomDbError(
      'CATEGORY_NOT_FOUND',
      'Select a valid room category for this business.',
      'categoryId'
    );
  }

  if (pgError.code === '23514') {
    throw new RoomDbError('INVALID_ROOM_DATA', 'Room data violates a database constraint.');
  }

  if (
    pgError.code === 'ECONNREFUSED' ||
    pgError.code === 'ENOTFOUND' ||
    pgError.code === 'ETIMEDOUT' ||
    pgError.code === '28P01' ||
    pgError.code === '3D000' ||
    pgError.code === '57P03' ||
    /connection timeout|timeout expired|terminating connection/i.test(
      (error as { message?: string }).message ?? ''
    )
  ) {
    throw new RoomDbError(
      'DATABASE_UNAVAILABLE',
      'Room storage is temporarily unavailable. Please try again shortly.'
    );
  }

  throw error;
}

/** Every room belongs to a branch. Resolve the requested or default one. */
export async function resolveScopeBranch(scope: RoomScope): Promise<string> {
  if (scope.branchId) return scope.branchId;
  const result = await getPool().query<{ id: string }>(
    `SELECT id FROM branches
      WHERE tenant_id = $1 AND status = 'ACTIVE'
      ORDER BY is_default DESC, created_at ASC LIMIT 1`,
    [scope.tenantId]
  );
  if (!result.rows[0]) {
    throw new RoomDbError('INVALID_ROOM_DATA', 'Create a branch before adding rooms.');
  }
  return result.rows[0].id;
}

/* ---------------------------------- rooms --------------------------------- */

export async function listRooms(scope: RoomScope): Promise<Room[]> {
  try {
    const result = await getPool().query<RoomRow>(
      `SELECT ${ROOM_COLUMNS}
         FROM rooms
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR branch_id = $2)
          AND archived_at IS NULL
        ORDER BY created_at ASC, id ASC`,
      [scope.tenantId, scope.branchId]
    );
    return result.rows.map(mapRoom);
  } catch (error) {
    return mapPostgresError(error);
  }
}

export async function getRoom(scope: RoomScope, id: string): Promise<Room> {
  try {
    const result = await getPool().query<RoomRow>(
      `SELECT ${ROOM_COLUMNS}
         FROM rooms
        WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL`,
      [id, scope.tenantId]
    );
    if (result.rowCount === 0) {
      throw new RoomDbError('ROOM_NOT_FOUND', 'This room no longer exists.');
    }
    return mapRoom(result.rows[0]);
  } catch (error) {
    if (error instanceof RoomDbError) throw error;
    return mapPostgresError(error);
  }
}

export async function createRoom(scope: RoomScope, input: ValidRoomInput): Promise<Room> {
  try {
    const branchId = await resolveScopeBranch(scope);
    const result = await getPool().query<RoomRow>(
      `INSERT INTO rooms (
         id, tenant_id, branch_id, room_number, name, category_id, floor, capacity,
         status, description, hourly_rate, daily_rate, overnight_rate, currency,
         pricing_updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'TZS', now())
       RETURNING ${ROOM_COLUMNS}`,
      [
        `room-${randomUUID()}`,
        scope.tenantId,
        branchId,
        input.roomNumber,
        input.name,
        input.categoryId,
        input.floor,
        input.capacity,
        input.status,
        input.description,
        input.pricing.hourlyRate,
        input.pricing.dailyRate,
        input.pricing.overnightRate,
      ]
    );
    return mapRoom(result.rows[0]);
  } catch (error) {
    return mapPostgresError(error);
  }
}

export async function updateRoom(
  scope: RoomScope,
  id: string,
  input: ValidRoomInput
): Promise<Room> {
  try {
    const result = await getPool().query<RoomRow>(
      `UPDATE rooms
          SET room_number = $3,
              name = $4,
              category_id = $5,
              floor = $6,
              capacity = $7,
              status = $8,
              description = $9,
              hourly_rate = $10,
              daily_rate = $11,
              overnight_rate = $12,
              pricing_updated_at = now(),
              updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
        RETURNING ${ROOM_COLUMNS}`,
      [
        id,
        scope.tenantId,
        input.roomNumber,
        input.name,
        input.categoryId,
        input.floor,
        input.capacity,
        input.status,
        input.description,
        input.pricing.hourlyRate,
        input.pricing.dailyRate,
        input.pricing.overnightRate,
      ]
    );

    if (result.rowCount === 0) {
      throw new RoomDbError('ROOM_NOT_FOUND', 'This room no longer exists.');
    }
    return mapRoom(result.rows[0]);
  } catch (error) {
    if (error instanceof RoomDbError) throw error;
    return mapPostgresError(error);
  }
}

/** Operational status change only — never touches pricing or booking state. */
export async function updateRoomStatus(
  scope: RoomScope,
  id: string,
  status: RoomStatus
): Promise<Room> {
  try {
    const result = await getPool().query<RoomRow>(
      `UPDATE rooms
          SET status = $3, updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
        RETURNING ${ROOM_COLUMNS}`,
      [id, scope.tenantId, status]
    );
    if (result.rowCount === 0) {
      throw new RoomDbError('ROOM_NOT_FOUND', 'This room no longer exists.');
    }
    return mapRoom(result.rows[0]);
  } catch (error) {
    if (error instanceof RoomDbError) throw error;
    return mapPostgresError(error);
  }
}

/**
 * A room may not be removed while a non-terminal reservation or an active stay
 * references it.
 */
async function assertNoActiveReservations(client: PoolClient, roomId: string): Promise<void> {
  const active = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM reservations
      WHERE room_id = $1
        AND status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')`,
    [roomId]
  );
  if (Number(active.rows[0]?.count ?? 0) > 0) {
    throw new RoomDbError(
      'ROOM_HAS_ACTIVE_RESERVATIONS',
      'This room has active reservations and cannot be deleted.'
    );
  }

  const stay = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM guest_stays WHERE room_id = $1 AND status = 'ACTIVE'`,
    [roomId]
  );
  if (Number(stay.rows[0]?.count ?? 0) > 0) {
    throw new RoomDbError(
      'ROOM_HAS_ACTIVE_RESERVATIONS',
      'This room has an active guest stay and cannot be deleted.'
    );
  }
}

export async function deleteRoom(scope: RoomScope, id: string): Promise<void> {
  await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM rooms
        WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL FOR UPDATE`,
      [id, scope.tenantId]
    );
    if (existing.rowCount === 0) {
      throw new RoomDbError('ROOM_NOT_FOUND', 'This room no longer exists.');
    }

    await assertNoActiveReservations(client, id);

    await client.query(
      `UPDATE rooms SET archived_at = now(), updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [id, scope.tenantId]
    );
  });
}

/* -------------------------------- categories ------------------------------ */

export async function listCategories(scope: RoomScope): Promise<RoomCategory[]> {
  try {
    const result = await getPool().query<CategoryRow>(
      `SELECT ${CATEGORY_COLUMNS}
         FROM room_categories
        WHERE tenant_id = $1
        ORDER BY created_at ASC, id ASC`,
      [scope.tenantId]
    );
    return result.rows.map(mapCategory);
  } catch (error) {
    return mapPostgresError(error);
  }
}

export async function getCategory(scope: RoomScope, id: string): Promise<RoomCategory> {
  const result = await getPool().query<CategoryRow>(
    `SELECT ${CATEGORY_COLUMNS} FROM room_categories WHERE id = $1 AND tenant_id = $2`,
    [id, scope.tenantId]
  );
  if (result.rowCount === 0) {
    throw new RoomDbError('CATEGORY_NOT_FOUND', 'This category no longer exists.');
  }
  return mapCategory(result.rows[0]);
}

export async function createCategory(
  scope: RoomScope,
  input: ValidCategoryInput
): Promise<RoomCategory> {
  try {
    const result = await getPool().query<CategoryRow>(
      `INSERT INTO room_categories (id, tenant_id, branch_id, name, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${CATEGORY_COLUMNS}`,
      [`cat-${randomUUID()}`, scope.tenantId, scope.branchId, input.name, input.description]
    );
    return mapCategory(result.rows[0]);
  } catch (error) {
    return mapPostgresError(error);
  }
}

export async function updateCategory(
  scope: RoomScope,
  id: string,
  input: ValidCategoryInput
): Promise<RoomCategory> {
  try {
    const result = await getPool().query<CategoryRow>(
      `UPDATE room_categories
          SET name = $3, description = $4, updated_at = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING ${CATEGORY_COLUMNS}`,
      [id, scope.tenantId, input.name, input.description]
    );
    if (result.rowCount === 0) {
      throw new RoomDbError('CATEGORY_NOT_FOUND', 'This category no longer exists.');
    }
    return mapCategory(result.rows[0]);
  } catch (error) {
    if (error instanceof RoomDbError) throw error;
    return mapPostgresError(error);
  }
}

/** Deleting a category with rooms (including archived rooms) would orphan data. */
export async function deleteCategory(scope: RoomScope, id: string): Promise<void> {
  await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM room_categories WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, scope.tenantId]
    );
    if (existing.rowCount === 0) {
      throw new RoomDbError('CATEGORY_NOT_FOUND', 'This category no longer exists.');
    }

    const inUse = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM rooms WHERE category_id = $1 AND tenant_id = $2`,
      [id, scope.tenantId]
    );
    if (Number(inUse.rows[0]?.count ?? 0) > 0) {
      throw new RoomDbError(
        'CATEGORY_HAS_ROOMS',
        'Move or delete the rooms in this category first.'
      );
    }

    await client.query('DELETE FROM room_categories WHERE id = $1 AND tenant_id = $2', [
      id,
      scope.tenantId,
    ]);
  });
}
