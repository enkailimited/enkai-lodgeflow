/**
 * ENKAI LODGEFLOW — PHASE 1: LODGE FOUNDATION
 * Room Management domain types.
 *
 * These types are intentionally isolated from the CCTV / occupancy types in
 * `types/lodgeflow.ts`. Room status here is an OPERATIONAL inventory status
 * maintained by lodge staff. It is never derived from CCTV events.
 */

/** Exact operational status identifiers required by Phase 1. */
export type RoomStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'RESERVED'
  | 'CLEANING'
  | 'MAINTENANCE'
  | 'OUT_OF_SERVICE';

/** Canonical ordering used by filters, selects and the dashboard. */
export const ROOM_STATUSES: RoomStatus[] = [
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'CLEANING',
  'MAINTENANCE',
  'OUT_OF_SERVICE',
];

/** Phase 1 supports Tanzanian Shillings only. */
export type RoomCurrency = 'TZS';

/**
 * Configurable room rates. A `null` value means the rate has NOT been
 * configured yet — it is never treated as zero by the UI.
 */
export interface RoomPricing {
  hourlyRate: number | null;
  dailyRate: number | null;
  overnightRate: number | null;
  currency: RoomCurrency;
}

export interface RoomCategory {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  /** Unique room number / code, e.g. "101" or "ROOM-101". */
  roomNumber: string;
  /** Optional human friendly room name. */
  name: string | null;
  categoryId: string;
  /** Free-text location, e.g. "Floor 1 — North Wing". */
  floor: string;
  /** Maximum number of guests. */
  capacity: number;
  status: RoomStatus;
  description: string | null;
  pricing: RoomPricing;
  /**
   * GATE 2.0: last time room pricing was written. Optional so the Phase 1
   * browser repository and existing fixtures stay source-compatible.
   */
  pricingUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload used when creating a room. */
export interface RoomInput {
  roomNumber: string;
  name: string | null;
  categoryId: string;
  floor: string;
  capacity: number;
  status: RoomStatus;
  description: string | null;
  pricing: RoomPricing;
}

/** Payload used when editing a room (all fields editable). */
export type RoomUpdateInput = RoomInput;

export interface RoomCategoryInput {
  name: string;
  description: string | null;
}

/** Aggregate figures shown on the Rooms Dashboard. Computed from real data. */
export interface RoomStatusCounts {
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  cleaning: number;
  maintenance: number;
  outOfService: number;
}
