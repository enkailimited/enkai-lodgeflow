/**
 * ENKAI LODGEFLOW — GATE 2.0
 * Shared HTTP response envelope + error translation for the room API.
 *
 * Success: { data, meta }
 * Failure: { error: { code, message, fieldErrors?, details?, requestId } }
 *
 * Database/driver messages are never forwarded to clients.
 */

import { randomUUID } from 'node:crypto';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { RoomDbError, isRoomDbError } from '../db/errors';

export interface ErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  details?: Record<string, unknown>;
  requestId: string;
}

const STATUS_BY_CODE: Record<string, number> = {
  ROOM_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  DUPLICATE_ROOM_NUMBER: 409,
  DUPLICATE_CATEGORY_NAME: 409,
  CATEGORY_HAS_ROOMS: 409,
  ROOM_HAS_ACTIVE_RESERVATIONS: 409,
  IMPORT_ALREADY_APPLIED: 409,
  IMPORT_CONFLICT: 409,
  IMPORT_INVALID_PAYLOAD: 422,
  VALIDATION_FAILED: 422,
  INVALID_ROOM_DATA: 422,
  INVALID_CATEGORY_DATA: 422,
  INVALID_PRICING: 422,
  INVALID_STATUS: 409,
  DATABASE_UNAVAILABLE: 503,
  ADMIN_TOKEN_NOT_CONFIGURED: 503,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
};

export function sendData(
  res: Response,
  data: unknown,
  meta: Record<string, unknown> = {}
): void {
  res.status(200).json({ data, meta: { requestId: randomUUID(), ...meta } });
}

export function sendCreated(
  res: Response,
  data: unknown,
  meta: Record<string, unknown> = {}
): void {
  res.status(201).json({ data, meta: { requestId: randomUUID(), ...meta } });
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  extra: { fieldErrors?: Record<string, string>; details?: Record<string, unknown> } = {}
): void {
  const body: ErrorBody = {
    code,
    message,
    requestId: randomUUID(),
    ...(extra.fieldErrors && Object.keys(extra.fieldErrors).length > 0
      ? { fieldErrors: extra.fieldErrors }
      : {}),
    ...(extra.details ? { details: extra.details } : {}),
  };
  res.status(status).json({ error: body });
}

export function sendRoomDbError(res: Response, error: RoomDbError): void {
  const status = STATUS_BY_CODE[error.code] ?? 500;
  sendError(res, status, error.code, error.message, {
    ...(error.field ? { fieldErrors: { [error.field]: error.message } } : {}),
    ...(error.details ? { details: error.details } : {}),
  });
}

/** Express 4 does not await async handlers; this adapter does. */
export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Final error middleware for the room routers. */
export function roomErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) return;

  if (isRoomDbError(error)) {
    sendRoomDbError(res, error);
    return;
  }

  // express.json() body-parser errors
  const bodyError = error as { type?: string; status?: number };
  if (bodyError?.type === 'entity.too.large') {
    sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    return;
  }
  if (bodyError?.type === 'entity.parse.failed') {
    sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error('[room-api] unhandled error:', message);
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
}

/**
 * Final error middleware for the ERP routers. Maps domain validation errors
 * and typed database errors; never forwards driver messages.
 */
export function apiErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) return;

  if (isRoomDbError(error)) {
    sendRoomDbError(res, error);
    return;
  }

  const validation = error as { name?: string; fieldErrors?: Record<string, string> };
  if (validation?.name === 'ValidationError' && validation.fieldErrors) {
    sendError(res, 422, 'VALIDATION_FAILED', 'Please correct the highlighted fields.', {
      fieldErrors: validation.fieldErrors,
    });
    return;
  }

  const pgError = error as { code?: string; constraint?: string };
  if (pgError?.code === '23505') {
    sendError(res, 409, 'DUPLICATE_RECORD', 'A record with those details already exists.');
    return;
  }
  if (pgError?.code === '23503') {
    sendError(res, 409, 'REFERENCE_CONFLICT', 'A referenced record no longer exists.');
    return;
  }
  if (pgError?.code === '23P01') {
    sendError(res, 409, 'ROOM_HAS_ACTIVE_RESERVATIONS', 'That room is already reserved for those dates.');
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error('[api] unhandled error:', message);
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
}
