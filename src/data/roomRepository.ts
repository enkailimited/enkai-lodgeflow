/**
 * ENKAI LODGEFLOW — PHASE 1
 * Room Management data-access layer.
 *
 * IMPORTANT — PERSISTENCE STATUS (GATE 2.0)
 * -----------------------------------------
 * Runtime room storage is now PostgreSQL behind the Express room API. This
 * file is retained for two purposes only:
 *   1. the Phase 1 foundation test suite (`npm run test:rooms`), and
 *   2. the explicit one-time browser -> server import preview.
 *
 * `LocalRoomRepository` must never be wired into the running application: a
 * second writable inventory would reintroduce split-brain data.
 *
 * The public interface remains the contract implemented by
 * `HttpRoomRepository`, so UI components are unaffected by the migration.
 */

import {
  Room,
  RoomCategory,
  RoomCategoryInput,
  RoomInput,
  RoomStatus,
  RoomUpdateInput,
  ROOM_STATUSES,
  RoomPricing,
} from '../types/room';
import {
  findDuplicateCategoryName,
  findDuplicateRoomNumber,
  isBlank,
  normalizeText,
  validatePricing,
} from './roomValidation';

export const ROOM_STORAGE_KEY = 'enkai-lodgeflow.room-inventory.v1';
const DB_VERSION = 1;

export type RoomRepositoryErrorCode =
  | 'DUPLICATE_ROOM_NUMBER'
  | 'DUPLICATE_CATEGORY_NAME'
  | 'ROOM_NOT_FOUND'
  | 'CATEGORY_NOT_FOUND'
  | 'INVALID_ROOM_DATA'
  | 'INVALID_CATEGORY_DATA'
  | 'INVALID_PRICING'
  | 'INVALID_STATUS'
  | 'STORAGE_UNAVAILABLE'
  | 'CATEGORY_HAS_ROOMS'
  | 'ROOM_HAS_ACTIVE_RESERVATIONS'
  | 'VALIDATION_FAILED'
  | 'NETWORK_ERROR'
  | 'DATABASE_UNAVAILABLE'
  | 'IMPORT_FAILED'
  | 'IMPORT_ALREADY_APPLIED'
  | 'FORBIDDEN'
  | 'ADMIN_TOKEN_NOT_CONFIGURED'
  | 'SERVER_ERROR';

export class RoomRepositoryError extends Error {
  readonly code: RoomRepositoryErrorCode;
  readonly field?: string;

  constructor(code: RoomRepositoryErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'RoomRepositoryError';
    this.code = code;
    this.field = field;
  }
}

/** Minimal storage contract — satisfied by `window.localStorage`. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RoomDatabaseSnapshot {
  version: number;
  rooms: Room[];
  categories: RoomCategory[];
  updatedAt: string;
}

export interface RoomRepositoryOptions {
  storage: StorageLike;
  /** Small artificial latency so saving states are observable in the UI. */
  latencyMs?: number;
}

export interface RoomRepository {
  listRooms(): Promise<Room[]>;
  listCategories(): Promise<RoomCategory[]>;
  createRoom(input: RoomInput): Promise<Room>;
  updateRoom(id: string, input: RoomUpdateInput): Promise<Room>;
  updateRoomStatus(id: string, status: RoomStatus): Promise<Room>;
  deleteRoom(id: string): Promise<void>;
  createCategory(input: RoomCategoryInput): Promise<RoomCategory>;
  updateCategory(id: string, input: RoomCategoryInput): Promise<RoomCategory>;
  deleteCategory(id: string): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return `${prefix}-${globalCrypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Demo seed data                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Development/demo seed only. Rate values are illustrative placeholders, NOT
 * real lodge tariffs, and several rates are intentionally left unconfigured to
 * demonstrate the "not configured" state.
 */
export function createSeedDatabase(): RoomDatabaseSnapshot {
  const timestamp = nowIso();
  const category = (id: string, name: string, description: string): RoomCategory => ({
    id,
    name,
    description,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const categories: RoomCategory[] = [
    category('cat-standard', 'Standard', 'Entry-level rooms with essential amenities.'),
    category('cat-deluxe', 'Deluxe', 'Larger rooms with upgraded furnishings.'),
    category('cat-executive', 'Executive', 'Business-oriented rooms with a dedicated workspace.'),
    category('cat-suite', 'Suite', 'Multi-room accommodation with a separate living area.'),
  ];

  const pricing = (
    hourlyRate: number | null,
    dailyRate: number | null,
    overnightRate: number | null
  ): RoomPricing => ({ hourlyRate, dailyRate, overnightRate, currency: 'TZS' });

  const room = (
    id: string,
    roomNumber: string,
    name: string,
    categoryId: string,
    floor: string,
    capacity: number,
    status: RoomStatus,
    description: string,
    roomPricing: RoomPricing
  ): Room => ({
    id,
    roomNumber,
    name,
    categoryId,
    floor,
    capacity,
    status,
    description,
    pricing: roomPricing,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const rooms: Room[] = [
    room('room-101', '101', 'Garden View Standard', 'cat-standard', 'Floor 1 — North Wing', 2, 'OCCUPIED', 'Ground floor room facing the garden courtyard.', pricing(25000, 120000, 150000)),
    room('room-102', '102', 'Courtyard Standard', 'cat-standard', 'Floor 1 — North Wing', 2, 'AVAILABLE', 'Quiet room overlooking the inner courtyard.', pricing(25000, 120000, 150000)),
    room('room-103', '103', 'Deluxe Twin', 'cat-deluxe', 'Floor 1 — South Wing', 2, 'CLEANING', 'Twin bed configuration with a work desk.', pricing(null, 140000, 170000)),
    room('room-104', '104', 'Deluxe King', 'cat-deluxe', 'Floor 1 — South Wing', 3, 'RESERVED', 'King bed room with an extra day bed.', pricing(null, 160000, 190000)),
    room('room-105', '105', 'Compact Single', 'cat-standard', 'Floor 1 — South Wing', 1, 'RESERVED', 'Single occupancy room for short stays.', pricing(15000, 80000, null)),
    room('room-201', '201', 'Executive King', 'cat-executive', 'Floor 2 — Executive Wing', 2, 'OCCUPIED', 'Executive wing room with workspace and lounge chair.', pricing(null, 220000, 260000)),
    room('room-202', '202', 'Executive Twin', 'cat-executive', 'Floor 2 — Executive Wing', 2, 'MAINTENANCE', 'Twin executive room currently awaiting plumbing repair.', pricing(null, null, null)),
    room('room-203', '203', 'Executive Corner', 'cat-executive', 'Floor 2 — Executive Wing', 2, 'AVAILABLE', 'Corner room with additional natural light.', pricing(null, 230000, 270000)),
    room('room-204', '204', 'Deluxe Balcony', 'cat-deluxe', 'Floor 2 — Executive Wing', 2, 'CLEANING', 'Deluxe room with a private balcony.', pricing(null, null, null)),
    room('room-301', '301', 'Penthouse Suite', 'cat-suite', 'Floor 3 — Penthouse Wing', 4, 'OUT_OF_SERVICE', 'Top floor suite withdrawn from sale pending refurbishment.', pricing(null, 450000, 520000)),
    room('room-302', '302', 'Family Suite', 'cat-suite', 'Floor 3 — Penthouse Wing', 4, 'AVAILABLE', 'Two-bedroom suite suitable for families.', pricing(null, 400000, 480000)),
    room('room-303', '303', 'Executive Studio', 'cat-executive', 'Floor 3 — Penthouse Wing', 2, 'OCCUPIED', 'Studio layout with kitchenette and workspace.', pricing(null, 240000, 280000)),
  ];

  return { version: DB_VERSION, rooms, categories, updatedAt: timestamp };
}

/* -------------------------------------------------------------------------- */
/* Repository implementation                                                  */
/* -------------------------------------------------------------------------- */

export class LocalRoomRepository implements RoomRepository {
  private readonly storage: StorageLike;
  private readonly latencyMs: number;

  constructor(options: RoomRepositoryOptions) {
    this.storage = options.storage;
    this.latencyMs = options.latencyMs ?? 120;
  }

  /* ----------------------------- persistence ----------------------------- */

  private readDatabase(): RoomDatabaseSnapshot {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(ROOM_STORAGE_KEY);
    } catch {
      throw new RoomRepositoryError(
        'STORAGE_UNAVAILABLE',
        'Browser storage could not be read. Data will not be saved.'
      );
    }

    if (!raw) {
      const seeded = createSeedDatabase();
      this.writeDatabase(seeded);
      return seeded;
    }

    try {
      const parsed = JSON.parse(raw) as RoomDatabaseSnapshot;
      if (!parsed || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.categories)) {
        throw new Error('Invalid room database shape');
      }
      return parsed;
    } catch {
      // Corrupt/unreadable payload: reseed rather than silently losing the page.
      const seeded = createSeedDatabase();
      this.writeDatabase(seeded);
      return seeded;
    }
  }

  private writeDatabase(database: RoomDatabaseSnapshot): void {
    try {
      this.storage.setItem(
        ROOM_STORAGE_KEY,
        JSON.stringify({ ...database, version: DB_VERSION, updatedAt: nowIso() })
      );
    } catch {
      throw new RoomRepositoryError(
        'STORAGE_UNAVAILABLE',
        'Browser storage is unavailable or full. Changes were not saved.'
      );
    }
  }

  /* ------------------------------- reads --------------------------------- */

  async listRooms(): Promise<Room[]> {
    return clone(this.readDatabase().rooms);
  }

  async listCategories(): Promise<RoomCategory[]> {
    return clone(this.readDatabase().categories);
  }

  /* ------------------------------- rooms --------------------------------- */

  async createRoom(input: RoomInput): Promise<Room> {
    const database = this.readDatabase();
    const normalized = this.normalizeRoomInput(input, database);

    if (findDuplicateRoomNumber(normalized.roomNumber, database.rooms)) {
      throw new RoomRepositoryError(
        'DUPLICATE_ROOM_NUMBER',
        `Room number "${normalized.roomNumber}" already exists.`,
        'roomNumber'
      );
    }

    const timestamp = nowIso();
    const room: Room = {
      ...normalized,
      id: createId('room'),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await wait(this.latencyMs);
    this.writeDatabase({ ...database, rooms: [...database.rooms, room] });
    return clone(room);
  }

  async updateRoom(id: string, input: RoomUpdateInput): Promise<Room> {
    const database = this.readDatabase();
    const index = database.rooms.findIndex((room) => room.id === id);
    if (index < 0) {
      throw new RoomRepositoryError('ROOM_NOT_FOUND', 'This room no longer exists.');
    }

    const normalized = this.normalizeRoomInput(input, database);
    if (findDuplicateRoomNumber(normalized.roomNumber, database.rooms, id)) {
      throw new RoomRepositoryError(
        'DUPLICATE_ROOM_NUMBER',
        `Room number "${normalized.roomNumber}" already exists.`,
        'roomNumber'
      );
    }

    const existing = database.rooms[index];
    const updated: Room = {
      ...existing,
      ...normalized,
      updatedAt: nowIso(),
    };

    await wait(this.latencyMs);
    const rooms = [...database.rooms];
    rooms[index] = updated;
    this.writeDatabase({ ...database, rooms });
    return clone(updated);
  }

  /**
   * Operational status update only. Deliberately does NOT create bookings,
   * check-ins, check-outs, invoices or payments.
   */
  async updateRoomStatus(id: string, status: RoomStatus): Promise<Room> {
    if (!ROOM_STATUSES.includes(status)) {
      throw new RoomRepositoryError('INVALID_STATUS', 'Unknown room status.');
    }

    const database = this.readDatabase();
    const index = database.rooms.findIndex((room) => room.id === id);
    if (index < 0) {
      throw new RoomRepositoryError('ROOM_NOT_FOUND', 'This room no longer exists.');
    }

    const updated: Room = { ...database.rooms[index], status, updatedAt: nowIso() };

    await wait(this.latencyMs);
    const rooms = [...database.rooms];
    rooms[index] = updated;
    this.writeDatabase({ ...database, rooms });
    return clone(updated);
  }

  async deleteRoom(id: string): Promise<void> {
    const database = this.readDatabase();
    if (!database.rooms.some((room) => room.id === id)) {
      throw new RoomRepositoryError('ROOM_NOT_FOUND', 'This room no longer exists.');
    }
    await wait(this.latencyMs);
    this.writeDatabase({
      ...database,
      rooms: database.rooms.filter((room) => room.id !== id),
    });
  }

  /* ----------------------------- categories ------------------------------ */

  async createCategory(input: RoomCategoryInput): Promise<RoomCategory> {
    const database = this.readDatabase();
    const name = this.normalizeCategoryName(input.name);

    if (findDuplicateCategoryName(name, database.categories)) {
      throw new RoomRepositoryError(
        'DUPLICATE_CATEGORY_NAME',
        `A category named "${name}" already exists.`,
        'name'
      );
    }

    const timestamp = nowIso();
    const category: RoomCategory = {
      id: createId('cat'),
      name,
      description: isBlank(input.description) ? null : normalizeText(input.description as string),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await wait(this.latencyMs);
    this.writeDatabase({
      ...database,
      categories: [...database.categories, category],
    });
    return clone(category);
  }

  async updateCategory(id: string, input: RoomCategoryInput): Promise<RoomCategory> {
    const database = this.readDatabase();
    const index = database.categories.findIndex((category) => category.id === id);
    if (index < 0) {
      throw new RoomRepositoryError('CATEGORY_NOT_FOUND', 'This category no longer exists.');
    }

    const name = this.normalizeCategoryName(input.name);
    if (findDuplicateCategoryName(name, database.categories, id)) {
      throw new RoomRepositoryError(
        'DUPLICATE_CATEGORY_NAME',
        `A category named "${name}" already exists.`,
        'name'
      );
    }

    const updated: RoomCategory = {
      ...database.categories[index],
      name,
      description: isBlank(input.description) ? null : normalizeText(input.description as string),
      updatedAt: nowIso(),
    };

    await wait(this.latencyMs);
    const categories = [...database.categories];
    categories[index] = updated;
    this.writeDatabase({ ...database, categories });
    return clone(updated);
  }

  async deleteCategory(id: string): Promise<void> {
    const database = this.readDatabase();
    if (!database.categories.some((category) => category.id === id)) {
      throw new RoomRepositoryError('CATEGORY_NOT_FOUND', 'This category no longer exists.');
    }
    if (database.rooms.some((room) => room.categoryId === id)) {
      throw new RoomRepositoryError(
        'CATEGORY_HAS_ROOMS',
        'Move or delete the rooms in this category first.'
      );
    }
    await wait(this.latencyMs);
    this.writeDatabase({
      ...database,
      categories: database.categories.filter((category) => category.id !== id),
    });
  }

  /* ------------------------------ validation ------------------------------ */

  private normalizeRoomInput(input: RoomInput, database: RoomDatabaseSnapshot): RoomInput {
    const roomNumber = normalizeText(input.roomNumber ?? '');
    if (isBlank(roomNumber)) {
      throw new RoomRepositoryError('INVALID_ROOM_DATA', 'Room number is required.', 'roomNumber');
    }

    if (!ROOM_STATUSES.includes(input.status)) {
      throw new RoomRepositoryError('INVALID_STATUS', 'Unknown room status.', 'status');
    }

    if (!database.categories.some((category) => category.id === input.categoryId)) {
      throw new RoomRepositoryError(
        'CATEGORY_NOT_FOUND',
        'Select a valid room category.',
        'categoryId'
      );
    }

    if (isBlank(input.floor)) {
      throw new RoomRepositoryError('INVALID_ROOM_DATA', 'Floor / location is required.', 'floor');
    }

    if (!Number.isInteger(input.capacity) || input.capacity < 1) {
      throw new RoomRepositoryError(
        'INVALID_ROOM_DATA',
        'Maximum occupancy must be a whole number of at least 1.',
        'capacity'
      );
    }

    const pricingError = validatePricing(input.pricing);
    if (pricingError) {
      throw new RoomRepositoryError('INVALID_PRICING', pricingError, 'pricing');
    }

    return {
      roomNumber,
      name: isBlank(input.name) ? null : normalizeText(input.name as string),
      categoryId: input.categoryId,
      floor: normalizeText(input.floor),
      capacity: input.capacity,
      status: input.status,
      description: isBlank(input.description)
        ? null
        : normalizeText(input.description as string),
      pricing: {
        hourlyRate: input.pricing.hourlyRate,
        dailyRate: input.pricing.dailyRate,
        overnightRate: input.pricing.overnightRate,
        currency: 'TZS',
      },
    };
  }

  private normalizeCategoryName(name: string): string {
    const normalized = normalizeText(name ?? '');
    if (isBlank(normalized)) {
      throw new RoomRepositoryError(
        'INVALID_CATEGORY_DATA',
        'Category name is required.',
        'name'
      );
    }
    return normalized;
  }
}

/* -------------------------------------------------------------------------- */
/* Browser wiring                                                             */
/* -------------------------------------------------------------------------- */

export interface StorageResolution {
  storage: StorageLike;
  /** true when records survive a page reload (localStorage available). */
  persistent: boolean;
}

export function resolveBrowserStorage(): StorageResolution {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probeKey = '__enkai_room_storage_probe__';
      window.localStorage.setItem(probeKey, '1');
      window.localStorage.removeItem(probeKey);
      return { storage: window.localStorage, persistent: true };
    }
  } catch {
    /* fall through to in-memory storage */
  }
  return { storage: createMemoryStorage(), persistent: false };
}
