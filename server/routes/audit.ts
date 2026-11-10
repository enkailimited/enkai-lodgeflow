/**
 * Audit trail. Business users see their own tenant; platform staff with
 * platform.audit.read may read across tenants.
 */

import express, { Router } from 'express';
import { listAuditLogs } from '../db/auditStore';
import { apiErrorHandler, asyncRoute, sendData } from '../http/respond';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { pagination } from '../validation/common';

export function createAuditRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncRoute(async (req: AuthedRequest, res) => {
      const auth = req.auth;
      if (!auth) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
        return;
      }

      let tenantId: string | null;
      if (auth.tenantId) {
        if (!auth.permissions.includes('audit.read')) {
          res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Audit access is not permitted.' } });
          return;
        }
        tenantId = auth.tenantId;
      } else {
        if (!auth.permissions.includes('platform.audit.read')) {
          res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Audit access is not permitted.' } });
          return;
        }
        tenantId = req.query.tenantId ? String(req.query.tenantId) : null;
      }

      const { limit, offset } = pagination(req.query);
      const logs = await listAuditLogs({ tenantId, limit, offset });
      sendData(res, { logs }, { count: logs.length });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
