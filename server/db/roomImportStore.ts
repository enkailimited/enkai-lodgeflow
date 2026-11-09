/**
 * ENKAI LODGEFLOW — GATE 2.0
 * One-time, explicit browser -> PostgreSQL room inventory import.
 *
 * Rules:
 *  * Nothing is written by preview.
 *  * Commit runs in a single transaction.
 *  * Existing records are NEVER overwritten: identical rows are reported as
 *    "unchanged", differing rows as conflicts and skipped.
 *  * The same payload cannot be committed twice (payload hash + unique index).
 *  * Original Phase 1 IDs are preserved when they are free.
 */

import { createHash, randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { RoomStatus, ROOM_STATUSES } from '../../src/types/room';
import { normalizeText } from '../../src/data/roomValidation';
import {
  ValidCategoryInput,
  ValidRoomInput,
  validateCategoryInput,
  validateRoomInput,
} from '../validation/rooms';
import { RoomDbError } from './errors';
import { getPool, withTransaction } from './pool';

const MAX_IMPORT_RECORDS = 5_000;
const IMPORT_VERSION = 1;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

export interface ImportCounts {
  total: number;
  importable: number;
  unchanged: number;
  conflicts: number;
  invalid: number;
}

export interface ImportIssue {
  recordType: 'room' | 'category';
  index: number;
  id: string | null;
  code: string;
  message: string;
}

export interface ImportPreview {
  hash: string;
  categories: ImportCounts;
  rooms: ImportCounts;
  issues: ImportIssue[];
}

interface ImportableCategory extends ValidCategoryInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

interface ImportableRoom extends ValidRoomInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

interface Analysis {
  hash: string;
  categories: ImportCounts;
  rooms: ImportCounts;
  issues: ImportIssue[];
  importableCategories: ImportableCategory[];
  importableRooms: ImportableRoom[];
}

interface CategoryDbRow {
  id: string;
  name: string;
  description: string | null;
}

interface RoomDbRow {
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
  archived_at: Date | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function emptyCounts(): ImportCounts {
  return { total: 0, importable: 0, unchanged: 0, conflicts: 0, invalid: 0 };
}

function firstError(fieldErrors: Record<string, string>): string {
  const values = Object.values(fieldErrors);
  return values.length > 0 ? values[0] : 'Invalid record.';
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseIsoDate(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function rateEquals(existing: string | null, next: number | null): boolean {
  if (existing === null && next === null) return true;
  if (existing === null || next === null) return false;
  return Number(existing) === next;
}

function sameRoom(existing: RoomDbRow, next: ValidRoomInput): boolean {
  return (
    existing.room_number === next.roomNumber &&
    (existing.name ?? null) === (next.name ?? null) &&
    existing.category_id === next.categoryId &&
    existing.floor === next.floor &&
    Number(existing.capacity) === next.capacity &&
    existing.status === next.status &&
    (existing.description ?? null) === (next.description ?? null) &&
    rateEquals(existing.hourly_rate, next.pricing.hourlyRate) &&
    rateEquals(existing.daily_rate, next.pricing.dailyRate) &&
    rateEquals(existing.overnight_rate, next.pricing.overnightRate)
  );
}

async function loadDatabaseState(client: PoolClient): Promise<{
  categories: CategoryDbRow[];
  rooms: RoomDbRow[];
}> {
  const categories = await client.query<CategoryDbRow>(
    `SELECT id, name, description FROM room_categories`
  );
  const rooms = await client.query<RoomDbRow>(
    `SELECT id, room_number, name, category_id, floor, capacity, status, description,
            hourly_rate, daily_rate, overnight_rate, archived_at
       FROM rooms`
  );
  return { categories: categories.rows, rooms: rooms.rows };
}

async function analyze(client: PoolClient, raw: unknown): Promise<Analysis> {
  const payload = asRecord(raw);
  if (!payload) {
    throw new RoomDbError('IMPORT_INVALID_PAYLOAD', 'Import payload must be an object.');
  }

  const version = payload.version ?? IMPORT_VERSION;
  if (version !== IMPORT_VERSION) {
    throw new RoomDbError(
      'IMPORT_INVALID_PAYLOAD',
      `Unsupported local inventory version (expected ${IMPORT_VERSION}).`
    );
  }

  const categoryList = payload.categories;
  const roomList = payload.rooms;
  if (!Array.isArray(categoryList) || !Array.isArray(roomList)) {
    throw new RoomDbError(
      'IMPORT_INVALID_PAYLOAD',
      'Import payload must contain `categories` and `rooms` arrays.'
    );
  }
  if (categoryList.length > MAX_IMPORT_RECORDS || roomList.length > MAX_IMPORT_RECORDS) {
    throw new RoomDbError('IMPORT_INVALID_PAYLOAD', 'Import payload is too large.');
  }

  const db = await loadDatabaseState(client);
  const dbCategoryById = new Map(db.categories.map((row) => [row.id, row]));
  const dbCategoryByName = new Map(
    db.categories.map((row) => [row.name.trim().toLowerCase(), row])
  );
  const dbRoomById = new Map(db.rooms.map((row) => [row.id, row]));
  const dbActiveRoomByNumber = new Map(
    db.rooms
      .filter((row) => row.archived_at === null)
      .map((row) => [row.room_number.trim().toLowerCase(), row])
  );

  const issues: ImportIssue[] = [];
  const counts = { categories: emptyCounts(), rooms: emptyCounts() };
  const importableCategories: ImportableCategory[] = [];
  const importableRooms: ImportableRoom[] = [];

  const seenCategoryIds = new Set<string>();
  const seenCategoryNames = new Set<string>();
  const finalCategoryIds = new Set<string>(db.categories.map((row) => row.id));

  categoryList.forEach((record, index) => {
    counts.categories.total += 1;
    const rec = asRecord(record);
    const id = typeof rec?.id === 'string' ? rec.id.trim() : '';

    if (!rec || !ID_PATTERN.test(id)) {
      counts.categories.invalid += 1;
      issues.push({
        recordType: 'category',
        index,
        id: id || null,
        code: 'INVALID_ID',
        message: id ? 'Category id contains unsupported characters.' : 'Category id is required.',
      });
      return;
    }
    if (seenCategoryIds.has(id)) {
      counts.categories.invalid += 1;
      issues.push({
        recordType: 'category',
        index,
        id,
        code: 'DUPLICATE_ID',
        message: `Category ${id} appears more than once in the local inventory.`,
      });
      return;
    }
    seenCategoryIds.add(id);

    const validation = validateCategoryInput(rec);
    if (!validation.value) {
      counts.categories.invalid += 1;
      issues.push({
        recordType: 'category',
        index,
        id,
        code: 'INVALID_CATEGORY',
        message: firstError(validation.fieldErrors),
      });
      return;
    }

    const nameKey = validation.value.name.trim().toLowerCase();
    if (seenCategoryNames.has(nameKey)) {
      counts.categories.invalid += 1;
      issues.push({
        recordType: 'category',
        index,
        id,
        code: 'DUPLICATE_NAME',
        message: `Two local categories share the name "${validation.value.name}".`,
      });
      return;
    }
    seenCategoryNames.add(nameKey);

    const existingById = dbCategoryById.get(id);
    if (existingById) {
      const identical =
        existingById.name.trim().toLowerCase() === nameKey &&
        (existingById.description ?? null) === (validation.value.description ?? null);
      if (identical) {
        counts.categories.unchanged += 1;
      } else {
        counts.categories.conflicts += 1;
        issues.push({
          recordType: 'category',
          index,
          id,
          code: 'ID_CONFLICT',
          message: `Category ${id} already exists on the server with different details; it was not overwritten.`,
        });
      }
      return;
    }

    if (dbCategoryByName.has(nameKey)) {
      counts.categories.conflicts += 1;
      issues.push({
        recordType: 'category',
        index,
        id,
        code: 'NAME_CONFLICT',
        message: `A server category named "${validation.value.name}" already exists under a different id.`,
      });
      return;
    }

    counts.categories.importable += 1;
    finalCategoryIds.add(id);
    importableCategories.push({
      id,
      name: validation.value.name,
      description: validation.value.description,
      createdAt: parseIsoDate(rec.createdAt),
      updatedAt: parseIsoDate(rec.updatedAt),
    });
  });

  const seenRoomIds = new Set<string>();
  const seenRoomNumbers = new Set<string>();

  roomList.forEach((record, index) => {
    counts.rooms.total += 1;
    const rec = asRecord(record);
    const id = typeof rec?.id === 'string' ? rec.id.trim() : '';

    if (!rec || !ID_PATTERN.test(id)) {
      counts.rooms.invalid += 1;
      issues.push({
        recordType: 'room',
        index,
        id: id || null,
        code: 'INVALID_ID',
        message: id ? 'Room id contains unsupported characters.' : 'Room id is required.',
      });
      return;
    }
    if (seenRoomIds.has(id)) {
      counts.rooms.invalid += 1;
      issues.push({
        recordType: 'room',
        index,
        id,
        code: 'DUPLICATE_ID',
        message: `Room ${id} appears more than once in the local inventory.`,
      });
      return;
    }
    seenRoomIds.add(id);

    const validation = validateRoomInput(rec);
    if (!validation.value) {
      counts.rooms.invalid += 1;
      issues.push({
        recordType: 'room',
        index,
        id,
        code: 'INVALID_ROOM',
        message: firstError(validation.fieldErrors),
      });
      return;
    }

    const numberKey = validation.value.roomNumber.trim().toLowerCase();
    if (seenRoomNumbers.has(numberKey)) {
      counts.rooms.invalid += 1;
      issues.push({
        recordType: 'room',
        index,
        id,
        code: 'DUPLICATE_ROOM_NUMBER',
        message: `Two local rooms share the number "${validation.value.roomNumber}".`,
      });
      return;
    }
    seenRoomNumbers.add(numberKey);

    const existingById = dbRoomById.get(id);
    if (existingById) {
      if (sameRoom(existingById, validation.value)) {
        counts.rooms.unchanged += 1;
      } else {
        counts.rooms.conflicts += 1;
        issues.push({
          recordType: 'room',
          index,
          id,
          code: 'ID_CONFLICT',
          message: `Room ${id} already exists on the server with different details; it was not overwritten.`,
        });
      }
      return;
    }

    if (dbActiveRoomByNumber.has(numberKey)) {
      counts.rooms.conflicts += 1;
      issues.push({
        recordType: 'room',
        index,
        id,
        code: 'ROOM_NUMBER_CONFLICT',
        message: `Room number "${validation.value.roomNumber}" is already used on the server.`,
      });
      return;
    }

    if (!finalCategoryIds.has(validation.value.categoryId)) {
      counts.rooms.invalid += 1;
      issues.push({
        recordType: 'room',
        index,
        id,
        code: 'CATEGORY_MISSING',
        message: `Room ${validation.value.roomNumber} references a category that is not being imported and does not exist on the server.`,
      });
      return;
    }

    counts.rooms.importable += 1;
    importableRooms.push({
      id,
      ...validation.value,
      createdAt: parseIsoDate(rec.createdAt),
      updatedAt: parseIsoDate(rec.updatedAt),
    });
  });

  const hash = createHash('sha256')
    .update(stableStringify({ version, categories: categoryList, rooms: roomList }))
    .digest('hex');

  return {
    hash,
    categories: counts.categories,
    rooms: counts.rooms,
    issues,
    importableCategories,
    importableRooms,
  };
}

function publicPreview(analysis: Analysis): ImportPreview {
  return {
    hash: analysis.hash,
    categories: analysis.categories,
    rooms: analysis.rooms,
    issues: analysis.issues,
  };
}

export async function previewRoomImport(raw: unknown): Promise<ImportPreview> {
  const client = await getPool().connect();
  try {
    return publicPreview(await analyze(client, raw));
  } finally {
    client.release();
  }
}

export interface ImportCommitResult {
  runId: string;
  categories: ImportCounts;
  rooms: ImportCounts;
  importedCategories: number;
  importedRooms: number;
  skippedCategories: number;
  skippedRooms: number;
  issues: ImportIssue[];
}

export async function commitRoomImport(raw: unknown): Promise<ImportCommitResult> {
  return withTransaction(async (client) => {
    const analysis = await analyze(client, raw);

    const previous = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM room_import_runs WHERE payload_hash = $1`,
      [analysis.hash]
    );
    if (previous.rowCount && previous.rowCount > 0) {
      throw new RoomDbError(
        'IMPORT_ALREADY_APPLIED',
        `This exact local inventory was already imported on ${previous.rows[0].created_at.toISOString()}.`,
        undefined,
        { payloadHash: analysis.hash }
      );
    }

    let importedCategories = 0;
    for (const category of analysis.importableCategories) {
      const result = await client.query(
        `INSERT INTO room_categories (id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [category.id, category.name, category.description, category.createdAt, category.updatedAt]
      );
      importedCategories += result.rowCount ?? 0;
    }

    let importedRooms = 0;
    for (const room of analysis.importableRooms) {
      const result = await client.query(
        `INSERT INTO rooms (
           id, room_number, name, category_id, floor, capacity, status, description,
           hourly_rate, daily_rate, overnight_rate, currency, pricing_updated_at,
           created_at, updated_at
         )
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'TZS',$12,$13,$14
          WHERE EXISTS (SELECT 1 FROM room_categories WHERE id = $4)
         ON CONFLICT DO NOTHING`,
        [
          room.id,
          room.roomNumber,
          room.name,
          room.categoryId,
          room.floor,
          room.capacity,
          room.status,
          room.description,
          room.pricing.hourlyRate,
          room.pricing.dailyRate,
          room.pricing.overnightRate,
          room.updatedAt,
          room.createdAt,
          room.updatedAt,
        ]
      );
      importedRooms += result.rowCount ?? 0;
    }

    const summary: ImportCommitResult = {
      runId: `import-${randomUUID()}`,
      categories: analysis.categories,
      rooms: analysis.rooms,
      importedCategories,
      importedRooms,
      skippedCategories: analysis.categories.total - importedCategories,
      skippedRooms: analysis.rooms.total - importedRooms,
      issues: analysis.issues,
    };

    await client.query(
      `INSERT INTO room_import_runs (id, payload_hash, summary)
       VALUES ($1, $2, $3::jsonb)`,
      [summary.runId, analysis.hash, JSON.stringify(summary)]
    );

    return summary;
  });
}

/** Exposed for tests: status values accepted during import. */
export const IMPORTABLE_ROOM_STATUSES: RoomStatus[] = [...ROOM_STATUSES];

/** Exposed for tests: normalizes a category name the same way the importer does. */
export function normalizeImportedName(name: string): string {
  return normalizeText(name);
}
