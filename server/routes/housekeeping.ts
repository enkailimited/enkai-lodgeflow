/**
 * Housekeeping, inspections and maintenance.
 */

import express, { Router } from 'express';
import {
  createHousekeepingTask,
  createMaintenanceRequest,
  inspectRoom,
  listHousekeepingTasks,
  listMaintenanceRequests,
  markRoomAvailable,
  startHousekeepingTask,
  submitForInspection,
  updateMaintenanceStatus,
} from '../db/housekeepingStore';
import { recordAudit } from '../db/auditStore';
import { resolveScopeBranch } from '../db/roomStore';
import { apiErrorHandler, asyncRoute, sendCreated, sendData } from '../http/respond';
import {
  AuthedRequest,
  getScope,
  requireAuth,
  requirePermission,
  resolveTenantScope,
} from '../middleware/auth';
import { asString } from '../validation/common';

export function createHousekeepingRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/tasks',
    requirePermission('housekeeping.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const tasks = await listHousekeepingTasks(scope.tenantId, {
        branchId: scope.branchId,
        status: req.query.status ? String(req.query.status) : null,
        roomId: req.query.roomId ? String(req.query.roomId) : null,
      });
      sendData(res, { tasks }, { count: tasks.length });
    })
  );

  router.post(
    '/tasks',
    requirePermission('housekeeping.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const task = await createHousekeepingTask(scope.tenantId, branchId, scope.user.id, {
        roomId: asString(req.body?.roomId, 'roomId', { required: true }) as string,
        taskType: asString(req.body?.taskType, 'taskType', { max: 30 }) ?? 'STAYOVER',
        priority: asString(req.body?.priority, 'priority', { max: 20 }) ?? 'NORMAL',
        assignedTo: asString(req.body?.assignedTo, 'assignedTo'),
        notes: asString(req.body?.notes, 'notes', { max: 1000 }),
      });
      sendCreated(res, { task });
    })
  );

  router.post(
    '/tasks/:id/start',
    requirePermission('housekeeping.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const task = await startHousekeepingTask(scope.tenantId, req.params.id, scope.user.id);
      sendData(res, { task });
    })
  );

  router.post(
    '/tasks/:id/submit',
    requirePermission('housekeeping.write'),
    asyncRoute(async (req, res) => {
      const task = await submitForInspection(getScope(req).tenantId, req.params.id);
      sendData(res, { task });
    })
  );

  router.post(
    '/tasks/:id/inspect',
    requirePermission('housekeeping.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const passed = req.body?.passed;
      if (typeof passed !== 'boolean') {
        res.status(422).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Inspection result is required.',
            fieldErrors: { passed: 'Pass or fail the inspection.' },
            requestId: 'inspect',
          },
        });
        return;
      }
      const result = await inspectRoom(
        scope.tenantId,
        branchId,
        req.params.id,
        scope.user.id,
        passed,
        asString(req.body?.notes, 'notes', { max: 1000 })
      );
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: passed ? 'housekeeping.inspection_passed' : 'housekeeping.inspection_failed',
        entityType: 'housekeeping_task',
        entityId: req.params.id,
        metadata: { roomStatus: result.roomStatus },
        ip: req.ip,
      });
      sendData(res, result);
    })
  );

  router.post(
    '/rooms/:roomId/ready',
    requirePermission('housekeeping.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const result = await markRoomAvailable(scope.tenantId, req.params.roomId, scope.user.id);
      sendData(res, result);
    })
  );

  router.get(
    '/maintenance',
    requirePermission('maintenance.read'),
    asyncRoute(async (req, res) => {
      const rows = await listMaintenanceRequests(
        getScope(req).tenantId,
        req.query.status ? String(req.query.status) : null
      );
      sendData(res, { requests: rows }, { count: rows.length });
    })
  );

  router.post(
    '/maintenance',
    requirePermission('maintenance.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const request = await createMaintenanceRequest(scope.tenantId, branchId, scope.user.id, {
        roomId: asString(req.body?.roomId, 'roomId'),
        title: asString(req.body?.title, 'title', { required: true, max: 160 }) as string,
        description: asString(req.body?.description, 'description', { max: 2000 }),
        priority: asString(req.body?.priority, 'priority', { max: 20 }) ?? 'NORMAL',
      });
      sendCreated(res, { request });
    })
  );

  router.patch(
    '/maintenance/:id',
    requirePermission('maintenance.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const request = await updateMaintenanceStatus(
        scope.tenantId,
        req.params.id,
        asString(req.body?.status, 'status', { required: true, max: 20 }) as string,
        scope.user.id
      );
      sendData(res, { request });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
