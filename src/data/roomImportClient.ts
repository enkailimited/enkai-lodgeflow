/**
 * ENKAI LODGEFLOW — GATE 2.0
 * Client helpers for the explicit Phase 1 browser -> PostgreSQL import.
 *
 * Reading localStorage is intentionally confined to this module. The rest of
 * the application never treats browser storage as a room source of truth.
 */

import { ROOM_STORAGE_KEY } from './roomRepository';
import { requestApi } from './httpRoomRepository';

export interface LocalRoomInventory {
  version: number;
  rooms: unknown[];
  categories: unknown[];
  updatedAt?: string;
}

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

export interface RoomImportPreview {
  hash: string;
  categories: ImportCounts;
  rooms: ImportCounts;
  issues: ImportIssue[];
}

export interface RoomImportCommitResult {
  runId: string;
  categories: ImportCounts;
  rooms: ImportCounts;
  importedCategories: number;
  importedRooms: number;
  skippedCategories: number;
  skippedRooms: number;
  issues: ImportIssue[];
}

function parseInventory(raw: string | null): LocalRoomInventory | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalRoomInventory> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.rooms) || !Array.isArray(parsed.categories)) return null;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      rooms: parsed.rooms,
      categories: parsed.categories,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    return null;
  }
}

/** Returns the legacy Phase 1 snapshot, or null when nothing is stored. */
export function readLocalRoomInventory(): LocalRoomInventory | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseInventory(window.localStorage.getItem(ROOM_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readLocalRoomInventorySummary(): { rooms: number; categories: number } | null {
  const inventory = readLocalRoomInventory();
  if (!inventory) return null;
  return { rooms: inventory.rooms.length, categories: inventory.categories.length };
}

/**
 * Only called after a successful server commit and an explicit owner action.
 * Until then the browser copy remains untouched as a safety net.
 */
export function clearLocalRoomInventory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ROOM_STORAGE_KEY);
  } catch {
    // Storage can be unavailable; nothing else to do.
  }
}

export async function previewLocalRoomImport(
  inventory: LocalRoomInventory
): Promise<RoomImportPreview> {
  return requestApi<RoomImportPreview>('/api/room-import/preview', {
    method: 'POST',
    body: JSON.stringify(inventory),
  });
}

export async function commitLocalRoomImport(
  inventory: LocalRoomInventory
): Promise<RoomImportCommitResult> {
  return requestApi<RoomImportCommitResult>('/api/room-import/commit', {
    method: 'POST',
    body: JSON.stringify(inventory),
    admin: true,
  });
}
