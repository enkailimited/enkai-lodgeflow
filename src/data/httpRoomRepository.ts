/**
 * ENKAI LODGEFLOW — GATE 2.0
 * HTTP implementation of the Phase 1 `RoomRepository` contract.
 *
 * The store and every UI component keep using the same typed interface; only
 * the backing implementation changed from localStorage to the Express API.
 */

import {
  Room,
  RoomCategory,
  RoomCategoryInput,
  RoomInput,
  RoomStatus,
  RoomUpdateInput,
} from '../types/room';
import { RoomRepository, RoomRepositoryError, RoomRepositoryErrorCode } from './roomRepository';
import { getAdminToken } from './adminToken';

interface SuccessEnvelope<T> {
  data: T;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string>;
  };
}

const KNOWN_ERROR_CODES = new Set<RoomRepositoryErrorCode>([
  'DUPLICATE_ROOM_NUMBER',
  'DUPLICATE_CATEGORY_NAME',
  'ROOM_NOT_FOUND',
  'CATEGORY_NOT_FOUND',
  'INVALID_ROOM_DATA',
  'INVALID_CATEGORY_DATA',
  'INVALID_PRICING',
  'INVALID_STATUS',
  'CATEGORY_HAS_ROOMS',
  'ROOM_HAS_ACTIVE_RESERVATIONS',
  'VALIDATION_FAILED',
  'NETWORK_ERROR',
  'DATABASE_UNAVAILABLE',
  'IMPORT_FAILED',
  'IMPORT_ALREADY_APPLIED',
  'FORBIDDEN',
  'ADMIN_TOKEN_NOT_CONFIGURED',
  'SERVER_ERROR',
]);

function normalizeErrorCode(code: string | undefined, status: number): RoomRepositoryErrorCode {
  if (code && KNOWN_ERROR_CODES.has(code as RoomRepositoryErrorCode)) {
    return code as RoomRepositoryErrorCode;
  }
  if (status === 401 || status === 403) return 'FORBIDDEN';
  if (status === 404) return 'ROOM_NOT_FOUND';
  if (status === 503) return 'DATABASE_UNAVAILABLE';
  return 'SERVER_ERROR';
}

export interface ApiRequestOptions extends RequestInit {
  /** Attach the session admin token (destructive operations only). */
  admin?: boolean;
}

/** Shared fetch wrapper: validates the envelope and maps errors to domain codes. */
export async function requestApi<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { admin, headers, ...init } = options;
  const requestHeaders = new Headers(headers);
  if (init.body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  if (admin) {
    const token = getAdminToken();
    if (token) requestHeaders.set('X-Admin-Token', token);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: requestHeaders,
      credentials: 'include',
    });
  } catch {
    throw new RoomRepositoryError(
      'NETWORK_ERROR',
      'Cannot reach the lodge server. Check the connection and try again.'
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body (proxy error page, etc.) falls through to the status check.
  }

  if (!response.ok) {
    const errorPayload = (payload as ErrorEnvelope | null)?.error;
    const code = normalizeErrorCode(errorPayload?.code, response.status);
    const fieldErrors = errorPayload?.fieldErrors;
    const field = fieldErrors ? Object.keys(fieldErrors)[0] : undefined;
    const message =
      errorPayload?.message ??
      (response.status === 503
        ? 'Room storage is unavailable right now.'
        : 'The room operation could not be completed.');
    throw new RoomRepositoryError(code, message, field);
  }

  const envelope = payload as SuccessEnvelope<T> | null;
  if (!envelope || typeof envelope !== 'object' || !('data' in envelope)) {
    throw new RoomRepositoryError(
      'SERVER_ERROR',
      'The server returned an unexpected response.'
    );
  }
  return envelope.data;
}

export class HttpRoomRepository implements RoomRepository {
  async listRooms(): Promise<Room[]> {
    const data = await requestApi<{ rooms: Room[] }>('/api/rooms');
    return data.rooms;
  }

  async listCategories(): Promise<RoomCategory[]> {
    const data = await requestApi<{ categories: RoomCategory[] }>('/api/room-categories');
    return data.categories;
  }

  async createRoom(input: RoomInput): Promise<Room> {
    const data = await requestApi<{ room: Room }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return data.room;
  }

  async updateRoom(id: string, input: RoomUpdateInput): Promise<Room> {
    const data = await requestApi<{ room: Room }>(`/api/rooms/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return data.room;
  }

  async updateRoomStatus(id: string, status: RoomStatus): Promise<Room> {
    const data = await requestApi<{ room: Room }>(`/api/rooms/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return data.room;
  }

  async deleteRoom(id: string): Promise<void> {
    await requestApi<void>(`/api/rooms/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      admin: true,
    });
  }

  async createCategory(input: RoomCategoryInput): Promise<RoomCategory> {
    const data = await requestApi<{ category: RoomCategory }>('/api/room-categories', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return data.category;
  }

  async updateCategory(id: string, input: RoomCategoryInput): Promise<RoomCategory> {
    const data = await requestApi<{ category: RoomCategory }>(
      `/api/room-categories/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(input) }
    );
    return data.category;
  }

  async deleteCategory(id: string): Promise<void> {
    await requestApi<void>(`/api/room-categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      admin: true,
    });
  }
}
