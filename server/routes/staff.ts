/**
 * Staff directory, roles and account lifecycle.
 */

import express, { Router } from 'express';
import { createStaff, listRoles, listStaff, updateStaff } from '../db/tenantStore';
import { recordAudit } from '../db/auditStore';
import { apiErrorHandler, asyncRoute, sendCreated, sendData } from '../http/respond';
import {
  AuthedRequest,
  getScope,
  requireAuth,
  requirePermission,
  resolveTenantScope,
} from '../middleware/auth';
import { asString } from '../validation/common';

export function createStaffRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/',
    requirePermission('staff.read'),
    asyncRoute(async (req, res) => {
      const staff = await listStaff(getScope(req).tenantId);
      sendData(res, { staff }, { count: staff.length });
    })
  );

  router.get(
    '/roles',
    requirePermission('staff.read'),
    asyncRoute(async (req, res) => {
      const roles = await listRoles(getScope(req).tenantId);
      sendData(res, { roles }, { count: roles.length });
    })
  );

  router.post(
    '/',
    requirePermission('staff.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const password = asString(req.body?.password, 'password', { required: true, max: 200 }) as string;
      if (password.length < 8) {
        res.status(422).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Please correct the highlighted fields.',
            fieldErrors: { password: 'Use at least 8 characters.' },
            requestId: 'password',
          },
        });
        return;
      }

      const staff = await createStaff(scope.tenantId, {
        email: asString(req.body?.email, 'email', { required: true, max: 254 }) as string,
        displayName: asString(req.body?.displayName, 'displayName', { required: true, max: 120 }) as string,
        password,
        phone: asString(req.body?.phone, 'phone', { max: 40 }),
        roleKey: asString(req.body?.roleKey, 'roleKey', { required: true, max: 60 }) as string,
        branchId: asString(req.body?.branchId, 'branchId'),
      });

      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'staff.created',
        entityType: 'user',
        entityId: staff.id,
        metadata: { roleKey: req.body?.roleKey },
        ip: req.ip,
      });
      sendCreated(res, { staff });
    })
  );

  router.patch(
    '/:id',
    requirePermission('staff.write'),
    asyncRoute(async (req, res) => {
      const status = req.body?.status;
      if (status !== undefined && !['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(status)) {
        res.status(422).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid staff status.',
            fieldErrors: { status: 'Use ACTIVE, SUSPENDED or DEACTIVATED.' },
            requestId: 'status',
          },
        });
        return;
      }
      const staff = await updateStaff(getScope(req).tenantId, req.params.id, {
        displayName: asString(req.body?.displayName, 'displayName', { max: 120 }) ?? undefined,
        phone: asString(req.body?.phone, 'phone', { max: 40 }),
        status,
        roleKey: asString(req.body?.roleKey, 'roleKey', { max: 60 }) ?? undefined,
      });
      sendData(res, { staff });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
