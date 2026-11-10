/**
 * Explicit one-time migration of Phase 1 browser inventory into PostgreSQL.
 *
 *   POST /api/room-import/preview
 *   POST /api/room-import/commit
 *
 * Preview is read-only. Commit never overwrites existing records and is
 * idempotent per tenant + payload hash.
 */

import express, { Router } from 'express';
import { commitRoomImport, previewRoomImport } from '../db/roomImportStore';
import { recordAudit } from '../db/auditStore';
import { asyncRoute, roomErrorHandler, sendData } from '../http/respond';
import { getScope, requireAuth, requirePermission, resolveTenantScope } from '../middleware/auth';

export function createRoomImportRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '1mb' }));
  router.use(requireAuth, resolveTenantScope);

  router.post(
    '/preview',
    requirePermission('room.write'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const preview = await previewRoomImport(req.body, { tenantId: scope.tenantId });
      sendData(res, preview);
    })
  );

  router.post(
    '/commit',
    requirePermission('room.write'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const result = await commitRoomImport(req.body, {
        tenantId: scope.tenantId,
        branchId: scope.branchId,
      });
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'room_import.committed',
        entityType: 'room_import',
        entityId: result.runId,
        metadata: {
          importedRooms: result.importedRooms,
          importedCategories: result.importedCategories,
        },
        ip: req.ip,
      });
      sendData(res, result);
    })
  );

  router.use(roomErrorHandler);
  return router;
}
