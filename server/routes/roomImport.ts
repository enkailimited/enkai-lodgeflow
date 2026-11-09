/**
 * ENKAI LODGEFLOW — GATE 2.0
 * Explicit one-time migration of Phase 1 browser inventory into PostgreSQL.
 *
 *   POST /api/room-import/preview
 *   POST /api/room-import/commit   (admin token)
 *
 * Preview is read-only. Commit never overwrites existing records and is
 * idempotent per payload hash.
 */

import express, { Router } from 'express';
import { commitRoomImport, previewRoomImport } from '../db/roomImportStore';
import { asyncRoute, roomErrorHandler, sendData } from '../http/respond';
import { requireAdminToken } from '../middleware/adminToken';

export function createRoomImportRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '1mb' }));

  router.post(
    '/preview',
    asyncRoute(async (req, res) => {
      const preview = await previewRoomImport(req.body);
      sendData(res, preview);
    })
  );

  router.post(
    '/commit',
    requireAdminToken,
    asyncRoute(async (req, res) => {
      const result = await commitRoomImport(req.body);
      sendData(res, result);
    })
  );

  router.use(roomErrorHandler);
  return router;
}
