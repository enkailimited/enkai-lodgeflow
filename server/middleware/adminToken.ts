/**
 * ENKAI LODGEFLOW — GATE 2.0
 * Temporary admin gate for destructive room operations.
 *
 * D11 (real staff sessions) is approved but not part of this gate. Until then
 * the only safe option is an operator-supplied server secret:
 *   - unset ROOM_ADMIN_TOKEN  -> destructive routes are disabled (503)
 *   - missing/wrong header    -> rejected (403)
 *
 * This is NOT authentication and must be replaced by the session-based
 * authorization layer before production reservations go live.
 */

import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { sendError } from '../http/respond';

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

export function requireAdminToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const expected = (process.env.ROOM_ADMIN_TOKEN ?? '').trim();

  if (!expected) {
    sendError(
      res,
      503,
      'ADMIN_TOKEN_NOT_CONFIGURED',
      'Destructive room operations are disabled until ROOM_ADMIN_TOKEN is configured on the server.'
    );
    return;
  }

  const provided = String(req.header(ADMIN_TOKEN_HEADER) ?? '');
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  const matches =
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer);

  if (!matches) {
    sendError(res, 403, 'FORBIDDEN', 'A valid admin token is required for this operation.');
    return;
  }

  next();
}
