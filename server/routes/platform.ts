/**
 * Platform administration endpoints. Only platform users with explicit
 * permissions may call these, and tenant summaries stay aggregate — platform
 * staff do not automatically see guests, finance or CCTV footage.
 */

import express, { Router } from 'express';
import { recordAudit } from '../db/auditStore';
import { listAuditLogs } from '../db/auditStore';
import { getPool } from '../db/pool';
import { createTenant, listTenants, updateTenant } from '../db/tenantStore';
import { apiErrorHandler, asyncRoute, sendCreated, sendData } from '../http/respond';
import { AuthedRequest, requireAuth, requirePermission, requirePlatform } from '../middleware/auth';
import { asEmail, asString, pagination } from '../validation/common';

export function createPlatformRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, requirePlatform);

  router.get(
    '/tenants',
    requirePermission('platform.tenants.read'),
    asyncRoute(async (_req, res) => {
      const tenants = await listTenants();
      sendData(res, { tenants }, { count: tenants.length });
    })
  );

  router.post(
    '/tenants',
    requirePermission('platform.tenants.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const name = asString(req.body?.name, 'name', { required: true, max: 160 }) as string;
      const slug = asString(req.body?.slug, 'slug', { required: true, max: 80 }) as string;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug.toLowerCase())) {
        res.status(422).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Slug may contain lowercase letters, numbers and hyphens only.',
            fieldErrors: { slug: 'Use lowercase letters, numbers and hyphens.' },
            requestId: 'slug',
          },
        });
        return;
      }

      const ownerName = asString(req.body?.ownerName, 'ownerName', { required: true, max: 120 }) as string;
      const ownerEmail = asEmail(req.body?.ownerEmail, 'ownerEmail', true) as string;
      const ownerPassword = asString(req.body?.ownerPassword, 'ownerPassword', {
        required: true,
        max: 200,
      }) as string;
      if (ownerPassword.length < 8) {
        res.status(422).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Please correct the highlighted fields.',
            fieldErrors: { ownerPassword: 'Use at least 8 characters.' },
            requestId: 'password',
          },
        });
        return;
      }

      const created = await createTenant({
        name,
        slug,
        legalName: asString(req.body?.legalName, 'legalName', { max: 200 }),
        email: asEmail(req.body?.email, 'email'),
        phone: asString(req.body?.phone, 'phone', { max: 40 }),
        country: asString(req.body?.country, 'country', { max: 80 }) ?? 'Tanzania',
        currency: asString(req.body?.currency, 'currency', { max: 3 }) ?? 'TZS',
        branchName: asString(req.body?.branchName, 'branchName', { max: 120 }) ?? 'Main Branch',
        ownerName,
        ownerEmail,
        ownerPassword,
      });

      await recordAudit({
        tenantId: created.tenant.id,
        actorUserId: req.auth?.id,
        actorEmail: req.auth?.email,
        action: 'platform.tenant.created',
        entityType: 'tenant',
        entityId: created.tenant.id,
        metadata: { name, slug },
        ip: req.ip,
      });

      sendCreated(res, created);
    })
  );

  router.patch(
    '/tenants/:id',
    requirePermission('platform.tenants.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const status = req.body?.status;
      if (status !== undefined && !['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(status)) {
        res.status(422).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid tenant status.',
            fieldErrors: { status: 'Use PENDING, ACTIVE, SUSPENDED or DEACTIVATED.' },
            requestId: 'status',
          },
        });
        return;
      }
      const tenant = await updateTenant(req.params.id, {
        name: asString(req.body?.name, 'name', { max: 160 }),
        legalName: asString(req.body?.legalName, 'legalName', { max: 200 }),
        email: asEmail(req.body?.email, 'email'),
        phone: asString(req.body?.phone, 'phone', { max: 40 }),
        country: asString(req.body?.country, 'country', { max: 80 }),
        currency: asString(req.body?.currency, 'currency', { max: 3 }),
        timezone: asString(req.body?.timezone, 'timezone', { max: 80 }),
        status: status ?? undefined,
      });
      await recordAudit({
        tenantId: tenant.id,
        actorUserId: req.auth?.id,
        actorEmail: req.auth?.email,
        action: 'platform.tenant.updated',
        entityType: 'tenant',
        entityId: tenant.id,
        metadata: { status: tenant.status },
        ip: req.ip,
      });
      sendData(res, { tenant });
    })
  );

  router.get(
    '/audit-logs',
    requirePermission('platform.audit.read'),
    asyncRoute(async (req, res) => {
      const { limit, offset } = pagination(req.query);
      const logs = await listAuditLogs({ tenantId: null, limit, offset });
      sendData(res, { logs }, { count: logs.length });
    })
  );

  router.get(
    '/health',
    requirePermission('platform.health.read'),
    asyncRoute(async (_req, res) => {
      const counts = await getPool().query(
        `SELECT
           (SELECT count(*)::int FROM tenants) AS tenants,
           (SELECT count(*)::int FROM tenants WHERE status = 'ACTIVE') AS active_tenants,
           (SELECT count(*)::int FROM users WHERE tenant_id IS NOT NULL) AS business_users,
           (SELECT count(*)::int FROM rooms WHERE archived_at IS NULL) AS rooms,
           (SELECT count(*)::int FROM cctv_alerts WHERE status = 'OPEN') AS open_alerts`
      );
      sendData(res, {
        database: 'connected',
        counts: counts.rows[0],
        serverTime: new Date().toISOString(),
      });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
