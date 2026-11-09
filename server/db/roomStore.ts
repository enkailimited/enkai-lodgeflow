/**
 * ENKAI LODGEFLOW — GATE 2.0
 * PostgreSQL room inventory data access.
 *
 * All SQL is parameterized. Rooms are soft-deleted (`archived_at`) so that a
 * deletion can never orphan historical references once reservations exist.
 * The D15 guard below already checks for a `reservations` table if a later gate
 * has created one.
 */

import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { Room, RoomCategory, RoomPricing, RoomStatus } from '../../src/types/room';
import { ValidCategoryInput, ValidRoomInput } from '../validation/rooms';
import { RoomDbError } from './errors';
import { getPool, withTransaction } from './pool';

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
    if (pgError.constraint === 'rooms_room_number_unique') {
      throw new RoomDbError(
        'DUPLICATE_ROOM_NUMBER',
        'A room with this number already exists.',
        'roomNumber'
      );
    }
    if (pgError.constraint === 'room_categories_name_unique') {
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
      'Select a valid room category.',
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
    // Neon/pg surface cold-start failures as a plain message without a code.
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

/* ---------------------------------- rooms --------------------------------- */

export async function listRooms(): Promise<Room[]> {
  try {
    const result = await getPool().query<RoomRow>(
      `SELECT ${ROOM_COLUMNS}
         FROM rooms
        WHERE archived_at IS NULL
        ORDER BY created_at ASC, id ASC`
    );
    return result.rows.map(mapRoom);
  } catch (error) {
    return mapPostgresError(error);
  }
}

export async function getRoom(id: string): Promise<Room> {
  try {
    const result = await getPool().query<RoomRow>(
      `SELECT ${ROOM_COLUMNS}
         FROM rooms
        WHERE id = $1 AND archived_at IS NULL`,
      [id]
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

export async function createRoom(input: ValidRoomInput): Promise<Room> {
  try {
    const result = await getPool().query<RoomRow>(
      `INSERT INTO rooms (
         id, room_number, name, category_id, floor, capacity, status, description,
         hourly_rate, daily_rate, overnight_rate, currency, pricing_updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'TZS', now())
       RETURNING ${ROOM_COLUMNS}`,
      [
        `room-${randomUUID()}`,
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

export async function updateRoom(id: string, input: ValidRoomInput): Promise<Room> {
  try {
    const result = await getPool().query<RoomRow>(
      `UPDATE rooms
          SET room_number = $2,
              name = $3,
              category_id = $4,
              floor = $5,
              capacity = $6,
              status = $7,
              description = $8,
              hourly_rate = $9,
              daily_rate = $10,
              overnight_rate = $11,
              pricing_updated_at = now(),
              updated_at = now()
        WHERE id = $1 AND archived_at IS NULL
        RETURNING ${ROOM_COLUMNS}`,
      [
        id,
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
export async function updateRoomStatus(id: string, status: RoomStatus): Promise<Room> {
  try {
    const result = await getPool().query<RoomRow>(
      `UPDATE rooms
          SET status = $2, updated_at = now()
        WHERE id = $1 AND archived_at IS NULL
        RETURNING ${ROOM_COLUMNS}`,
      [id, status]
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
 * D15: a room may not be removed while a non-terminal reservation references
 * it. Reservations do not exist yet, so the guard is conditional on the table
 * being present. Terminal (CANCELLED / NO_SHOW / COMPLETED) reservations do not
 * block removal.
 */
async function assertNoActiveReservations(client: PoolClient, roomId: string): Promise<void> {
  const tableCheck = await client.query<{ table_name: string | null }>(
    `SELECT to_regclass('public.reservations')::text AS table_name`
  );
  if (!tableCheck.rows[0]?.table_name) return;

  const active = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM reservations
      WHERE room_id = $1
        AND status IN ('PENDING', 'CONFIRMED')`,
    [roomId]
  );

  if (Number(active.rows[0]?.count ?? 0) > 0) {
    throw new RoomDbError(
      'ROOM_HAS_ACTIVE_RESERVATIONS',
      'This room has active reservations and cannot be deleted.'
    );
  }
}

export async function deleteRoom(id: string): Promise<void> {
  await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM rooms WHERE id = $1 AND archived_at IS NULL FOR UPDATE`,
      [id]
    );
    if (existing.rowCount === 0) {
      throw new RoomDbError('ROOM_NOT_FOUND', 'This room no longer exists.');
    }

    await assertNoActiveReservations(client, id);

    await client.query(
      `UPDATE rooms
          SET archived_at = now(), updated_at = now()
        WHERE id = $1`,
      [id]
    );
  });
}

/* -------------------------------- categories ------------------------------ */

export async function listCategories(): Promise<RoomCategory[]> {
  try {
    const result = await getPool().query<CategoryRow>(
      `SELECT ${CATEGORY_COLUMNS}
         FROM room_categories
        ORDER BY created_at ASC, id ASC`
    );
    return result.rows.map(mapCategory);
  } catch (error) {
    return mapPostgresError(error);
  }
}

export async function getCategory(id: string): Promise<RoomCategory> {
  const result = await getPool().query<CategoryRow>(
    `SELECT ${CATEGORY_COLUMNS} FROM room_categories WHERE id = $1`,
    [id]
  );
  if (result.rowCount === 0) {
    throw new RoomDbError('CATEGORY_NOT_FOUND', 'This category no longer exists.');
  }
  return mapCategory(result.rows[0]);
}

export async function createCategory(input: ValidCategoryInput): Promise<RoomCategory> {
  try {
    const result = await getPool().query<CategoryRow>(
      `INSERT INTO room_categories (id, name, description)
       VALUES ($1, $2, $3)
       RETURNING ${CATEGORY_COLUMNS}`,
      [`cat-${randomUUID()}`, input.name, input.description]
    );
    return mapCategory(result.rows[0]);
  } catch (error) {
    return mapPostgresError(error);
  }
}

export async function updateCategory(
  id: string,
  input: ValidCategoryInput
): Promise<RoomCategory> {
  try {
    const result = await getPool().query<CategoryRow>(
      `UPDATE room_categories
          SET name = $2, description = $3, updated_at = now()
        WHERE id = $1
        RETURNING ${CATEGORY_COLUMNS}`,
      [id, input.name, input.description]
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
export async function deleteCategory(id: string): Promise<void> {
  await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM room_categories WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (existing.rowCount === 0) {
      throw new RoomDbError('CATEGORY_NOT_FOUND', 'This category no longer exists.');
    }

    const inUse = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM rooms WHERE category_id = $1`,
      [id]
    );
    if (Number(inUse.rows[0]?.count ?? 0) > 0) {
      throw new RoomDbError(
        'CATEGORY_HAS_ROOMS',
        'Move or delete the rooms in this category first.'
      );
    }

    await client.query(`DELETE FROM room_categories WHERE id = $1`, [id]);
  });
}
