/**
 * ENKAI LODGEFLOW — PHASE 1
 * Pure validation/formatting helpers shared by the Room Management UI and the
 * data-access layer. Keeping these pure makes them straightforward to test.
 */

import { Room, RoomCategory, RoomPricing, RoomStatus, RoomStatusCounts } from '../types/room';

export const MAX_ROOM_CAPACITY = 20;

export interface ParsedValue<T> {
  value: T;
  error: string | null;
}

/** Trim + collapse internal whitespace. */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/**
 * Parse an optional TZS price.
 * - Empty input  -> { value: null } (rate not configured)
 * - Valid number -> { value: number >= 0 }
 * - Anything else -> { value: null, error }
 */
export function parseOptionalPrice(raw: string): ParsedValue<number | null> {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') {
    return { value: null, error: null };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { value: null, error: 'Enter a valid amount (digits only, no negative values).' };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: 'Enter a valid amount.' };
  }
  if (parsed < 0) {
    return { value: null, error: 'Amount cannot be negative.' };
  }
  return { value: parsed, error: null };
}

/** Parse the room capacity field. Must be a whole number >= 1. */
export function parseCapacity(raw: string): ParsedValue<number | null> {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') {
    return { value: null, error: 'Maximum occupancy is required.' };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { value: null, error: 'Maximum occupancy must be a whole number.' };
  }
  const parsed = Number(trimmed);
  if (parsed < 1) {
    return { value: null, error: 'Maximum occupancy must be at least 1.' };
  }
  if (parsed > MAX_ROOM_CAPACITY) {
    return { value: null, error: `Maximum occupancy cannot exceed ${MAX_ROOM_CAPACITY}.` };
  }
  return { value: parsed, error: null };
}

/** Validate a fully-assembled pricing object (repository-side guard). */
export function validatePricing(pricing: RoomPricing): string | null {
  if (!pricing || pricing.currency !== 'TZS') {
    return 'Pricing currency must be TZS.';
  }
  const rates = [pricing.hourlyRate, pricing.dailyRate, pricing.overnightRate];
  for (const rate of rates) {
    if (rate === null) continue;
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      return 'Room rates must be valid numbers or left unconfigured.';
    }
    if (rate < 0) {
      return 'Room rates cannot be negative.';
    }
  }
  return null;
}

export function hasConfiguredRate(pricing: RoomPricing): boolean {
  return (
    pricing.hourlyRate !== null ||
    pricing.dailyRate !== null ||
    pricing.overnightRate !== null
  );
}

const AMOUNT_FORMATTER = (() => {
  try {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  } catch {
    return null;
  }
})();

/** Format an amount as TZS, or return the "not configured" marker. */
export function formatTzs(amount: number | null): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return 'Not configured';
  }
  const formatted = AMOUNT_FORMATTER
    ? AMOUNT_FORMATTER.format(amount)
    : String(Math.round(amount));
  return `TZS ${formatted}`;
}

/** Case-insensitive duplicate check for room numbers. */
export function findDuplicateRoomNumber(
  roomNumber: string,
  rooms: Room[],
  excludeRoomId?: string
): Room | undefined {
  const target = normalizeText(roomNumber).toLowerCase();
  return rooms.find(
    (room) => room.id !== excludeRoomId && room.roomNumber.trim().toLowerCase() === target
  );
}

/** Case-insensitive duplicate check for category names. */
export function findDuplicateCategoryName(
  name: string,
  categories: RoomCategory[],
  excludeCategoryId?: string
): RoomCategory | undefined {
  const target = normalizeText(name).toLowerCase();
  return categories.find(
    (cat) => cat.id !== excludeCategoryId && normalizeText(cat.name).toLowerCase() === target
  );
}

/** Compute the Rooms Dashboard figures from the actual room records. */
export function countRoomsByStatus(rooms: Room[]): RoomStatusCounts {
  const counts: RoomStatusCounts = {
    total: rooms.length,
    available: 0,
    occupied: 0,
    reserved: 0,
    cleaning: 0,
    maintenance: 0,
    outOfService: 0,
  };
  const keyByStatus: Record<RoomStatus, keyof Omit<RoomStatusCounts, 'total'>> = {
    AVAILABLE: 'available',
    OCCUPIED: 'occupied',
    RESERVED: 'reserved',
    CLEANING: 'cleaning',
    MAINTENANCE: 'maintenance',
    OUT_OF_SERVICE: 'outOfService',
  };
  for (const room of rooms) {
    const key = keyByStatus[room.status];
    if (key) counts[key] += 1;
  }
  return counts;
}

export function percentageOf(total: number, value: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}
