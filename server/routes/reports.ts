/**
 * Reports, calculated from stored records only.
 */

import express, { Router } from 'express';
import {
  cctvSummary,
  dashboard,
  housekeepingReport,
  occupancyReport,
  reservationReport,
  revenueReport,
} from '../db/reportStore';
import { apiErrorHandler, asyncRoute, sendData } from '../http/respond';
import { getScope, requireAuth, requirePermission, resolveTenantScope } from '../middleware/auth';
import { asDate } from '../validation/common';

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function createReportsRouter(): Router {
  const router = Router();
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/dashboard',
    requirePermission('reports.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      sendData(res, await dashboard(scope.tenantId, scope.branchId));
    })
  );

  router.get(
    '/occupancy',
    requirePermission('reports.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const range = defaultRange();
      const from = asDate(req.query.from ?? range.from, 'from') as string;
      const to = asDate(req.query.to ?? range.to, 'to') as string;
      const rows = await occupancyReport(scope.tenantId, scope.branchId, from, to);
      sendData(res, { from, to, days: rows });
    })
  );

  router.get(
    '/revenue',
    requirePermission('reports.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const range = defaultRange();
      const from = asDate(req.query.from ?? range.from, 'from') as string;
      const to = asDate(req.query.to ?? range.to, 'to') as string;
      const report = await revenueReport(scope.tenantId, scope.branchId, from, to);
      sendData(res, { from, to, ...report });
    })
  );

  router.get(
    '/reservations',
    requirePermission('reports.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const range = defaultRange();
      const from = asDate(req.query.from ?? range.from, 'from') as string;
      const to = asDate(req.query.to ?? range.to, 'to') as string;
      const report = await reservationReport(scope.tenantId, scope.branchId, from, to);
      sendData(res, { from, to, ...report });
    })
  );

  router.get(
    '/housekeeping',
    requirePermission('reports.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const range = defaultRange();
      const from = asDate(req.query.from ?? range.from, 'from') as string;
      const to = asDate(req.query.to ?? range.to, 'to') as string;
      const report = await housekeepingReport(scope.tenantId, scope.branchId, from, to);
      sendData(res, { from, to, ...report });
    })
  );

  router.get(
    '/cctv',
    requirePermission('reports.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      sendData(res, await cctvSummary(scope.tenantId, scope.branchId));
    })
  );

  router.use(apiErrorHandler);
  return router;
}
