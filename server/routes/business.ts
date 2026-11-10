/**
 * Business profile and workspace summary.
 */

import express, { Router } from 'express';
import { getPool } from '../db/pool';
import { getTenant, updateTenant } from '../db/tenantStore';
import { apiErrorHandler, asyncRoute, sendData } from '../http/respond';
import {
  AuthedRequest,
  getScope,
  requireAuth,
  requirePermission,
  resolveTenantScope,
} from '../middleware/auth';
import { asString } from '../validation/common';

export function createBusinessRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/profile',
    requirePermission('business.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const tenant = await getTenant(scope.tenantId);
      sendData(res, { business: tenant });
    })
  );

  router.patch(
    '/profile',
    requirePermission('business.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const tenant = await updateTenant(scope.tenantId, {
        name: asString(req.body?.name, 'name', { max: 160 }),
        legalName: asString(req.body?.legalName, 'legalName', { max: 200 }),
        email: asString(req.body?.email, 'email', { max: 254 }),
        phone: asString(req.body?.phone, 'phone', { max: 40 }),
        country: asString(req.body?.country, 'country', { max: 80 }),
        currency: asString(req.body?.currency, 'currency', { max: 3 }),
        timezone: asString(req.body?.timezone, 'timezone', { max: 80 }),
      });
      sendData(res, { business: tenant });
    })
  );

  router.get(
    '/summary',
    requirePermission('business.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const result = await getPool().query(
        `SELECT
           (SELECT count(*)::int FROM branches WHERE tenant_id = $1) AS branches,
           (SELECT count(*)::int FROM rooms WHERE tenant_id = $1 AND archived_at IS NULL) AS rooms,
           (SELECT count(*)::int FROM guests WHERE tenant_id = $1 AND archived_at IS NULL) AS guests,
           (SELECT count(*)::int FROM users WHERE tenant_id = $1 AND status = 'ACTIVE') AS staff,
           (SELECT count(*)::int FROM guest_stays WHERE tenant_id = $1 AND status = 'ACTIVE') AS in_house,
           (SELECT count(*)::int FROM cameras WHERE tenant_id = $1) AS cameras,
           (SELECT count(*)::int FROM cctv_alerts WHERE tenant_id = $1 AND status = 'OPEN') AS open_alerts`,
        [scope.tenantId]
      );
      sendData(res, { summary: result.rows[0] });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
