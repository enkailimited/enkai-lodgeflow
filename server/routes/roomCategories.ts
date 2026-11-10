/**
 * Room category endpoints (tenant-scoped).
 *
 *   GET    /api/room-categories
 *   POST   /api/room-categories
 *   PATCH  /api/room-categories/:id
 *   DELETE /api/room-categories/:id   (blocked while rooms exist)
 */

import express, { Router } from 'express';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../db/roomStore';
import { recordAudit } from '../db/auditStore';
import { asyncRoute, roomErrorHandler, sendCreated, sendData, sendError } from '../http/respond';
import { getScope, requireAuth, requirePermission, resolveTenantScope } from '../middleware/auth';
import { validateCategoryInput } from '../validation/rooms';

function sendValidationError(
  res: Parameters<typeof sendError>[0],
  fieldErrors: Record<string, string>
): void {
  sendError(res, 422, 'VALIDATION_FAILED', 'Please correct the highlighted fields.', {
    fieldErrors,
  });
}

export function createRoomCategoriesRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/',
    requirePermission('room.read'),
    asyncRoute(async (req, res) => {
      const categories = await listCategories(getScope(req));
      sendData(res, { categories }, { count: categories.length });
    })
  );

  router.post(
    '/',
    requirePermission('room.write'),
    asyncRoute(async (req, res) => {
      const validation = validateCategoryInput(req.body);
      if (!validation.value) {
        sendValidationError(res, validation.fieldErrors);
        return;
      }
      const scope = getScope(req);
      const category = await createCategory(scope, validation.value);
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'room_category.created',
        entityType: 'room_category',
        entityId: category.id,
        ip: req.ip,
      });
      sendCreated(res, { category });
    })
  );

  router.patch(
    '/:id',
    requirePermission('room.write'),
    asyncRoute(async (req, res) => {
      const validation = validateCategoryInput(req.body);
      if (!validation.value) {
        sendValidationError(res, validation.fieldErrors);
        return;
      }
      const category = await updateCategory(getScope(req), req.params.id, validation.value);
      sendData(res, { category });
    })
  );

  router.delete(
    '/:id',
    requirePermission('room.delete'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      await deleteCategory(scope, req.params.id);
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'room_category.deleted',
        entityType: 'room_category',
        entityId: req.params.id,
        ip: req.ip,
      });
      res.status(204).end();
    })
  );

  router.use(roomErrorHandler);
  return router;
}
