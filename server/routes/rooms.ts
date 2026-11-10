/**
 * Room endpoints (tenant-scoped).
 *
 *   GET    /api/rooms
 *   GET    /api/rooms/:id
 *   POST   /api/rooms
 *   PATCH  /api/rooms/:id        (full room body, or { status } only)
 *   DELETE /api/rooms/:id        (room.delete permission)
 */

import express, { Router } from 'express';
import { createRoom, deleteRoom, getRoom, listRooms, updateRoom, updateRoomStatus } from '../db/roomStore';
import { recordAudit } from '../db/auditStore';
import { asyncRoute, roomErrorHandler, sendCreated, sendData, sendError } from '../http/respond';
import { getScope, requireAuth, requirePermission, resolveTenantScope } from '../middleware/auth';
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
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/',
    requirePermission('room.read'),
    asyncRoute(async (req, res) => {
      const rooms = await listRooms(getScope(req));
      sendData(res, { rooms }, { count: rooms.length });
    })
  );

  router.get(
    '/:id',
    requirePermission('room.read'),
    asyncRoute(async (req, res) => {
      const room = await getRoom(getScope(req), req.params.id);
      sendData(res, { room });
    })
  );

  router.post(
    '/',
    requirePermission('room.write'),
    asyncRoute(async (req, res) => {
      const validation = validateRoomInput(req.body);
      if (!validation.value) {
        sendValidationError(res, validation.fieldErrors);
        return;
      }
      const scope = getScope(req);
      const room = await createRoom(scope, validation.value);
      await recordAudit({
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'room.created',
        entityType: 'room',
        entityId: room.id,
        metadata: { roomNumber: room.roomNumber },
        ip: req.ip,
      });
      sendCreated(res, { room });
    })
  );

  router.patch(
    '/:id',
    requirePermission('room.write'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const body = (req.body ?? {}) as Record<string, unknown>;

      // Status-only operational update (Phase 1 behaviour preserved).
      if (Object.keys(body).length === 1 && 'status' in body) {
        const status = validateRoomStatus(body.status);
        if (!status) {
          sendValidationError(res, { status: 'Select a valid room status.' });
          return;
        }
        const room = await updateRoomStatus(scope, req.params.id, status);
        await recordAudit({
          tenantId: scope.tenantId,
          actorUserId: scope.user.id,
          actorEmail: scope.user.email,
          action: 'room.status_changed',
          entityType: 'room',
          entityId: room.id,
          metadata: { status },
          ip: req.ip,
        });
        sendData(res, { room });
        return;
      }

      const validation = validateRoomInput(body);
      if (!validation.value) {
        sendValidationError(res, validation.fieldErrors);
        return;
      }
      const room = await updateRoom(scope, req.params.id, validation.value);
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'room.updated',
        entityType: 'room',
        entityId: room.id,
        ip: req.ip,
      });
      sendData(res, { room });
    })
  );

  router.delete(
    '/:id',
    requirePermission('room.delete'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      await deleteRoom(scope, req.params.id);
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'room.archived',
        entityType: 'room',
        entityId: req.params.id,
        ip: req.ip,
      });
      res.status(204).end();
    })
  );

  router.use(roomErrorHandler);
  return router;
}
