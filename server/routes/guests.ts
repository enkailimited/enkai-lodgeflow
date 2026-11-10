/**
 * Guest directory, profiles and history.
 */

import express, { Router } from 'express';
import {
  createGuest,
  getGuest,
  guestHistory,
  listGuests,
  updateGuest,
} from '../db/guestStore';
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
import { asString, pagination } from '../validation/common';

export function createGuestsRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/',
    requirePermission('guest.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const { limit, offset } = pagination(req.query);
      const result = await listGuests(scope.tenantId, {
        search: String(req.query.search ?? ''),
        limit,
        offset,
      });
      sendData(res, result, { count: result.guests.length, total: result.total });
    })
  );

  router.post(
    '/',
    requirePermission('guest.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const guest = await createGuest(scope.tenantId, branchId, {
        fullName: asString(req.body?.fullName, 'fullName', { required: true, max: 160 }) as string,
        email: asString(req.body?.email, 'email', { max: 254 }),
        phone: asString(req.body?.phone, 'phone', { max: 40 }),
        nationality: asString(req.body?.nationality, 'nationality', { max: 80 }),
        idType: asString(req.body?.idType, 'idType', { max: 40 }),
        idNumber: asString(req.body?.idNumber, 'idNumber', { max: 80 }),
        address: asString(req.body?.address, 'address', { max: 300 }),
        notes: asString(req.body?.notes, 'notes', { max: 2000 }),
        marketingConsent: Boolean(req.body?.marketingConsent),
      });
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'guest.created',
        entityType: 'guest',
        entityId: guest.id,
        ip: req.ip,
      });
      sendCreated(res, { guest });
    })
  );

  router.get(
    '/:id',
    requirePermission('guest.read'),
    asyncRoute(async (req, res) => {
      const guest = await getGuest(getScope(req).tenantId, req.params.id);
      sendData(res, { guest });
    })
  );

  router.patch(
    '/:id',
    requirePermission('guest.write'),
    asyncRoute(async (req, res) => {
      const guest = await updateGuest(getScope(req).tenantId, req.params.id, {
        fullName: asString(req.body?.fullName, 'fullName', { max: 160 }) ?? undefined,
        email: asString(req.body?.email, 'email', { max: 254 }),
        phone: asString(req.body?.phone, 'phone', { max: 40 }),
        nationality: asString(req.body?.nationality, 'nationality', { max: 80 }),
        idType: asString(req.body?.idType, 'idType', { max: 40 }),
        idNumber: asString(req.body?.idNumber, 'idNumber', { max: 80 }),
        address: asString(req.body?.address, 'address', { max: 300 }),
        notes: asString(req.body?.notes, 'notes', { max: 2000 }),
      });
      sendData(res, { guest });
    })
  );

  router.get(
    '/:id/history',
    requirePermission('guest.read'),
    asyncRoute(async (req, res) => {
      const history = await guestHistory(getScope(req).tenantId, req.params.id);
      sendData(res, history);
    })
  );

  router.use(apiErrorHandler);
  return router;
}
