/**
 * ENKAI LODGEFLOW — GATE 2.0
 * Server-authoritative validation for room and category payloads.
 *
 * The Phase 1 browser repository validated its own writes. With PostgreSQL as
 * the source of truth the server must now enforce the same rules, because a
 * client can always post arbitrary JSON. Pure helpers from
 * `src/data/roomValidation.ts` are reused where they already exist.
 */

import { RoomPricing, RoomStatus, ROOM_STATUSES } from '../../src/types/room';
import { MAX_ROOM_CAPACITY, isBlank, normalizeText } from '../../src/data/roomValidation';

export const MAX_RATE = 9_999_999_999.99;
const MAX_ROOM_NUMBER_LENGTH = 32;
const MAX_ROOM_NAME_LENGTH = 120;
const MAX_FLOOR_LENGTH = 120;
const MAX_ROOM_DESCRIPTION_LENGTH = 1_000;
const MAX_CATEGORY_NAME_LENGTH = 80;
const MAX_CATEGORY_DESCRIPTION_LENGTH = 500;

export interface ValidationOutcome<T> {
  value: T | null;
  fieldErrors: Record<string, string>;
}

export interface ValidRoomInput {
  roomNumber: string;
  name: string | null;
  categoryId: string;
  floor: string;
  capacity: number;
  status: RoomStatus;
  description: string | null;
  pricing: RoomPricing;
}

export interface ValidCategoryInput {
  name: string;
  description: string | null;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function readOptionalText(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
  fieldErrors: Record<string, string>,
  label: string
): string | null {
  const raw = record[key];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    fieldErrors[key] = `${label} must be text.`;
    return null;
  }
  const normalized = normalizeText(raw);
  if (normalized.length > maxLength) {
    fieldErrors[key] = `${label} must be ${maxLength} characters or fewer.`;
    return null;
  }
  return normalized.length === 0 ? null : normalized;
}

function validateRate(
  value: unknown,
  field: string,
  fieldErrors: Record<string, string>
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fieldErrors[field] = 'Enter a valid amount.';
    return null;
  }
  if (value < 0) {
    fieldErrors[field] = 'Amount cannot be negative.';
    return null;
  }
  if (value > MAX_RATE) {
    fieldErrors[field] = 'Amount is too large.';
    return null;
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    fieldErrors[field] = 'Amount may have at most 2 decimal places.';
    return null;
  }
  return value;
}

export function validateRoomInput(raw: unknown): ValidationOutcome<ValidRoomInput> {
  const record = asRecord(raw);
  if (!record) {
    return { value: null, fieldErrors: { _: 'Room payload must be an object.' } };
  }

  const fieldErrors: Record<string, string> = {};

  const roomNumberRaw = record.roomNumber;
  const roomNumber =
    typeof roomNumberRaw === 'string' ? normalizeText(roomNumberRaw) : '';
  if (isBlank(roomNumber)) {
    fieldErrors.roomNumber = 'Room number is required.';
  } else if (roomNumber.length > MAX_ROOM_NUMBER_LENGTH) {
    fieldErrors.roomNumber = `Room number must be ${MAX_ROOM_NUMBER_LENGTH} characters or fewer.`;
  }

  const name = readOptionalText(record, 'name', MAX_ROOM_NAME_LENGTH, fieldErrors, 'Room name');
  const description = readOptionalText(
    record,
    'description',
    MAX_ROOM_DESCRIPTION_LENGTH,
    fieldErrors,
    'Description'
  );

  const categoryIdRaw = record.categoryId;
  const categoryId = typeof categoryIdRaw === 'string' ? categoryIdRaw.trim() : '';
  if (isBlank(categoryId)) {
    fieldErrors.categoryId = 'Select a valid room category.';
  }

  const floorRaw = record.floor;
  const floor = typeof floorRaw === 'string' ? normalizeText(floorRaw) : '';
  if (isBlank(floor)) {
    fieldErrors.floor = 'Floor / location is required.';
  } else if (floor.length > MAX_FLOOR_LENGTH) {
    fieldErrors.floor = `Floor / location must be ${MAX_FLOOR_LENGTH} characters or fewer.`;
  }

  const capacityRaw = record.capacity;
  let capacity = 0;
  if (typeof capacityRaw !== 'number' || !Number.isInteger(capacityRaw)) {
    fieldErrors.capacity = 'Maximum occupancy must be a whole number.';
  } else if (capacityRaw < 1) {
    fieldErrors.capacity = 'Maximum occupancy must be at least 1.';
  } else if (capacityRaw > MAX_ROOM_CAPACITY) {
    fieldErrors.capacity = `Maximum occupancy cannot exceed ${MAX_ROOM_CAPACITY}.`;
  } else {
    capacity = capacityRaw;
  }

  const statusRaw = record.status;
  const status = typeof statusRaw === 'string' ? (statusRaw as RoomStatus) : 'AVAILABLE';
  if (!ROOM_STATUSES.includes(status)) {
    fieldErrors.status = 'Unknown room status.';
  }

  const pricingRaw = asRecord(record.pricing);
  const pricing: RoomPricing = {
    hourlyRate: null,
    dailyRate: null,
    overnightRate: null,
    currency: 'TZS',
  };

  if (!pricingRaw) {
    fieldErrors.pricing = 'Room pricing is required.';
  } else {
    if (pricingRaw.currency !== undefined && pricingRaw.currency !== 'TZS') {
      fieldErrors['pricing.currency'] = 'Pricing currency must be TZS.';
    }
    pricing.hourlyRate = validateRate(
      pricingRaw.hourlyRate,
      'pricing.hourlyRate',
      fieldErrors
    );
    pricing.dailyRate = validateRate(pricingRaw.dailyRate, 'pricing.dailyRate', fieldErrors);
    pricing.overnightRate = validateRate(
      pricingRaw.overnightRate,
      'pricing.overnightRate',
      fieldErrors
    );
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { value: null, fieldErrors };
  }

  return {
    value: { roomNumber, name, categoryId, floor, capacity, status, description, pricing },
    fieldErrors: {},
  };
}

export function validateCategoryInput(raw: unknown): ValidationOutcome<ValidCategoryInput> {
  const record = asRecord(raw);
  if (!record) {
    return { value: null, fieldErrors: { _: 'Category payload must be an object.' } };
  }

  const fieldErrors: Record<string, string> = {};
  const nameRaw = record.name;
  const name = typeof nameRaw === 'string' ? normalizeText(nameRaw) : '';

  if (isBlank(name)) {
    fieldErrors.name = 'Category name is required.';
  } else if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    fieldErrors.name = `Category name must be ${MAX_CATEGORY_NAME_LENGTH} characters or fewer.`;
  }

  const description = readOptionalText(
    record,
    'description',
    MAX_CATEGORY_DESCRIPTION_LENGTH,
    fieldErrors,
    'Description'
  );

  if (Object.keys(fieldErrors).length > 0) return { value: null, fieldErrors };
  return { value: { name, description }, fieldErrors: {} };
}

/** Accepts a bare `{ status }` body or a full room body for PATCH. */
export function validateRoomStatus(raw: unknown): RoomStatus | null {
  if (typeof raw !== 'string') return null;
  return ROOM_STATUSES.includes(raw as RoomStatus) ? (raw as RoomStatus) : null;
}
