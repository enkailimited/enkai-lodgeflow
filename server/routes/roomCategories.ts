/**
 * ENKAI LODGEFLOW — GATE 2.0
 * Room category endpoints.
 *
 *   GET    /api/room-categories
 *   POST   /api/room-categories
 *   PATCH  /api/room-categories/:id
 *   DELETE /api/room-categories/:id   (admin token; blocked while rooms exist)
 */

import express, { Router } from 'express';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../db/roomStore';
import { asyncRoute, roomErrorHandler, sendCreated, sendData, sendError } from '../http/respond';
import { requireAdminToken } from '../middleware/adminToken';
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

  router.get(
    '/',
    asyncRoute(async (_req, res) => {
      const categories = await listCategories();
      sendData(res, { categories }, { count: categories.length });
    })
  );

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const validation = validateCategoryInput(req.body);
      if (!validation.value) {
        sendValidationError(res, validation.fieldErrors);
        return;
      }
      const category = await createCategory(validation.value);
      sendCreated(res, { category });
    })
  );

  router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
      const validation = validateCategoryInput(req.body);
      if (!validation.value) {
        sendValidationError(res, validation.fieldErrors);
        return;
      }
      const category = await updateCategory(req.params.id, validation.value);
      sendData(res, { category });
    })
  );

  router.delete(
    '/:id',
    requireAdminToken,
    asyncRoute(async (req, res) => {
      await deleteCategory(req.params.id);
      res.status(204).end();
    })
  );

  router.use(roomErrorHandler);
  return router;
}
