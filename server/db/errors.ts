/**
 * ENKAI LODGEFLOW — GATE 2.0
 * Typed database errors shared by the room data-access layer and HTTP routes.
 *
 * Codes mirror the Phase 1 `RoomRepositoryError` contract so the browser data
 * layer can keep one error vocabulary across both implementations.
 */

export type RoomDbErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'CATEGORY_NOT_FOUND'
  | 'DUPLICATE_ROOM_NUMBER'
  | 'DUPLICATE_CATEGORY_NAME'
  | 'INVALID_ROOM_DATA'
  | 'INVALID_CATEGORY_DATA'
  | 'INVALID_PRICING'
  | 'INVALID_STATUS'
  | 'CATEGORY_HAS_ROOMS'
  | 'ROOM_HAS_ACTIVE_RESERVATIONS'
  | 'IMPORT_ALREADY_APPLIED'
  | 'IMPORT_CONFLICT'
  | 'IMPORT_INVALID_PAYLOAD'
  | 'DATABASE_UNAVAILABLE';

export class RoomDbError extends Error {
  readonly code: RoomDbErrorCode;
  readonly field?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: RoomDbErrorCode,
    message: string,
    field?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RoomDbError';
    this.code = code;
    this.field = field;
    this.details = details;
  }
}

export function isRoomDbError(error: unknown): error is RoomDbError {
  return error instanceof RoomDbError;
}
