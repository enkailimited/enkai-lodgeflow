/**
 * ENKAI LODGEFLOW — GATE 2.0
 * Room endpoints.
 *
 *   GET    /api/rooms
 *   GET    /api/rooms/:id
 *   POST   /api/rooms
 *   PATCH  /api/rooms/:id        (full room body, or { status } only)
 *   DELETE /api/rooms/:id        (admin token)
 */

import express, { Router } from 'express';
import { getRoom, createRoom, deleteRoom, listRooms, updateRoom, updateRoomStatus } from '../db/roomStore';
import { asyncRoute, roomErrorHandler, sendCreated, sendData, sendError } from '../http/respond';
import { authorize } from '../middleware/auth';
import { validateRoomInput, validateRoomStatus } from '../validation/rooms';

function sendValidationError(
  res: Parameters<typeof sendError>[0],
  fieldErrors: Record<string, string>
): void {
  sendError(res, 422, 'VALIDATION_FAILED', 'Please correct the highlighted fields.', {
    fieldErrors,
  });
}

export function createRoomsRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));

  router.get(
    '/',
    asyncRoute(async (_req, res) => {
      const rooms = await listRooms();
      sendData(res, { rooms }, { count: rooms.length });
    })
  );

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const room = await getRoom(req.params.id);
      sendData(res, { room });
    })
  );

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const validation = validateRoomInput(req.body);
      if (!validation.value) {
        sendValidationError(res, validation.fieldErrors);
        return;
      }
      const room = await createRoom(validation.value);
      sendCreated(res, { room });
    })
  );

  router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const keys = Object.keys(body);

      if (keys.length === 1 && keys[0] === 'status') {
        const status = validateRoomStatus(body.status);
        if (!status) {
          sendValidationError(res, { status: 'Unknown room status.' });
          return;
        }
        const room = await updateRoomStatus(req.params.id, status);
        sendData(res, { room });
        return;
      }

      const existing = await getRoom(req.params.id);
      const merged = {
        roomNumber: body.roomNumber ?? existing.roomNumber,
        name: body.name !== undefined ? body.name : existing.name,
        categoryId: body.categoryId ?? existing.categoryId,
        floor: body.floor ?? existing.floor,
        capacity: body.capacity ?? existing.capacity,
        status: body.status ?? existing.status,
        description: body.description !== undefined ? body.description : existing.description,
        pricing: body.pricing ?? existing.pricing,
      };

      const validation = validateRoomInput(merged);
      if (!validation.value) {
        sendValidationError(res, validation.fieldErrors);
        return;
      }

      const room = await updateRoom(req.params.id, validation.value);
      sendData(res, { room });
    })
  );

  router.delete(
    '/:id',
    authorize('rooms.manage'),
    asyncRoute(async (req, res) => {
      await deleteRoom(req.params.id);
      res.status(204).end();
    })
  );

  router.use(roomErrorHandler);
  return router;
}
