/**
 * Branches, buildings and floors.
 */

import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool';
import { createBranch, listBranches, updateBranch } from '../db/tenantStore';
import { apiErrorHandler, asyncRoute, sendCreated, sendData } from '../http/respond';
import {
  AuthedRequest,
  getScope,
  requireAuth,
  requirePermission,
  resolveTenantScope,
} from '../middleware/auth';
import { asString } from '../validation/common';

function id(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function createBranchesRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/',
    requirePermission('branch.read'),
    asyncRoute(async (req, res) => {
      const branches = await listBranches(getScope(req).tenantId);
      sendData(res, { branches }, { count: branches.length });
    })
  );

  router.post(
    '/',
    requirePermission('branch.write'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const branch = await createBranch(scope.tenantId, {
        name: asString(req.body?.name, 'name', { required: true, max: 120 }) as string,
        code: asString(req.body?.code, 'code', { max: 20 }),
        address: asString(req.body?.address, 'address', { max: 300 }),
        city: asString(req.body?.city, 'city', { max: 120 }),
        phone: asString(req.body?.phone, 'phone', { max: 40 }),
        isDefault: Boolean(req.body?.isDefault),
      });
      sendCreated(res, { branch });
    })
  );

  router.patch(
    '/:id',
    requirePermission('branch.write'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const branch = await updateBranch(scope.tenantId, req.params.id, {
        name: asString(req.body?.name, 'name', { max: 120 }) ?? undefined,
        code: asString(req.body?.code, 'code', { max: 20 }),
        address: asString(req.body?.address, 'address', { max: 300 }),
        city: asString(req.body?.city, 'city', { max: 120 }),
        phone: asString(req.body?.phone, 'phone', { max: 40 }),
        isDefault: req.body?.isDefault === undefined ? undefined : Boolean(req.body.isDefault),
        status: asString(req.body?.status, 'status', { max: 20 }) ?? undefined,
      });
      sendData(res, { branch });
    })
  );

  router.get(
    '/:branchId/buildings',
    requirePermission('branch.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const result = await getPool().query(
        'SELECT * FROM buildings WHERE tenant_id = $1 AND branch_id = $2 ORDER BY name',
        [scope.tenantId, req.params.branchId]
      );
      sendData(res, { buildings: result.rows }, { count: result.rowCount });
    })
  );

  router.post(
    '/:branchId/buildings',
    requirePermission('branch.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const result = await getPool().query(
        `INSERT INTO buildings (id, tenant_id, branch_id, name)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [
          id('bld'),
          scope.tenantId,
          req.params.branchId,
          asString(req.body?.name, 'name', { required: true, max: 120 }),
        ]
      );
      sendCreated(res, { building: result.rows[0] });
    })
  );

  router.get(
    '/:branchId/floors',
    requirePermission('branch.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const result = await getPool().query(
        `SELECT * FROM floors WHERE tenant_id = $1 AND branch_id = $2 ORDER BY level NULLS LAST, name`,
        [scope.tenantId, req.params.branchId]
      );
      sendData(res, { floors: result.rows }, { count: result.rowCount });
    })
  );

  router.post(
    '/:branchId/floors',
    requirePermission('branch.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const level = req.body?.level === undefined || req.body?.level === null
        ? null
        : Number(req.body.level);
      if (level !== null && !Number.isInteger(level)) {
        res.status(422).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Floor level must be a whole number.',
            fieldErrors: { level: 'Use a whole number.' },
            requestId: 'level',
          },
        });
        return;
      }
      const result = await getPool().query(
        `INSERT INTO floors (id, tenant_id, branch_id, building_id, name, level)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          id('flr'),
          scope.tenantId,
          req.params.branchId,
          asString(req.body?.buildingId, 'buildingId', { max: 80 }),
          asString(req.body?.name, 'name', { required: true, max: 120 }),
          level,
        ]
      );
      sendCreated(res, { floor: result.rows[0] });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
