/**
 * Front office: arrivals, in-house, departures, check-in/check-out and requests.
 */

import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  checkIn,
  checkOut,
  createGuestRequest,
  listGuestRequests,
  listStays,
  resolveGuestRequest,
} from '../db/guestStore';
import { recordAudit } from '../db/auditStore';
import { getPool } from '../db/pool';
import { resolveScopeBranch } from '../db/roomStore';
import { apiErrorHandler, asyncRoute, sendCreated, sendData } from '../http/respond';
import {
  AuthedRequest,
  getScope,
  requireAuth,
  requirePermission,
  resolveTenantScope,
} from '../middleware/auth';
import { asMoney, asString } from '../validation/common';

const TZ = 'Africa/Dar_es_Salaam';

async function arrivals(tenantId: string, branchId: string | null): Promise<any[]> {
  const result = await getPool().query(
    `SELECT r.id, r.status, r.check_in_date::text AS check_in_date,
            r.check_out_date::text AS check_out_date, r.adults, r.children,
            g.id AS guest_id, g.full_name AS guest_name, g.phone,
            rm.id AS room_id, rm.room_number
       FROM reservations r
       JOIN guests g ON g.id = r.guest_id
       JOIN rooms rm ON rm.id = r.room_id
      WHERE r.tenant_id = $1
        AND ($2::text IS NULL OR r.branch_id = $2)
        AND r.status IN ('PENDING', 'CONFIRMED')
        AND r.check_in_date = (now() AT TIME ZONE $3)::date
      ORDER BY g.full_name`,
    [tenantId, branchId, TZ]
  );
  return result.rows;
}

async function departures(tenantId: string, branchId: string | null): Promise<any[]> {
  const result = await getPool().query(
    `SELECT s.id, s.check_in_at, s.room_charge,
            g.id AS guest_id, g.full_name AS guest_name,
            rm.id AS room_id, rm.room_number,
            coalesce((SELECT sum(i.total - i.amount_paid) FROM invoices i
              WHERE i.tenant_id = s.tenant_id AND i.stay_id = s.id
                AND i.status IN ('ISSUED', 'PARTIALLY_PAID')), 0) AS outstanding
       FROM guest_stays s
       JOIN guests g ON g.id = s.guest_id
       JOIN rooms rm ON rm.id = s.room_id
      WHERE s.tenant_id = $1
        AND ($2::text IS NULL OR s.branch_id = $2)
        AND s.status = 'ACTIVE'
      ORDER BY s.check_in_at`,
    [tenantId, branchId]
  );
  return result.rows.map((row) => ({ ...row, outstanding: Number(row.outstanding) }));
}

export function createFrontOfficeRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/arrivals',
    requirePermission('reservation.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const rows = await arrivals(scope.tenantId, scope.branchId);
      sendData(res, { arrivals: rows }, { count: rows.length });
    })
  );

  router.get(
    '/in-house',
    requirePermission('reservation.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const stays = await listStays(scope.tenantId, {
        branchId: scope.branchId,
        status: 'ACTIVE',
      });
      sendData(res, { stays }, { count: stays.length });
    })
  );

  router.get(
    '/departures',
    requirePermission('reservation.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const rows = await departures(scope.tenantId, scope.branchId);
      sendData(res, { departures: rows }, { count: rows.length });
    })
  );

  router.post(
    '/check-in',
    requirePermission('frontdesk.checkin'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const stay = await checkIn(scope.tenantId, branchId, scope.user.id, {
        reservationId: asString(req.body?.reservationId, 'reservationId') ?? undefined,
        guestId: asString(req.body?.guestId, 'guestId') ?? undefined,
        roomId: asString(req.body?.roomId, 'roomId') ?? undefined,
        roomCharge: asMoney(req.body?.roomCharge, 'roomCharge', { min: 0 }),
        notes: asString(req.body?.notes, 'notes', { max: 1000 }),
      });
      await recordAudit({
        tenantId: scope.tenantId,
        branchId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'frontdesk.check_in',
        entityType: 'guest_stay',
        entityId: stay.id,
        metadata: { roomId: stay.roomId, guestId: stay.guestId },
        ip: req.ip,
      });
      sendCreated(res, { stay });
    })
  );

  router.post(
    '/check-out',
    requirePermission('frontdesk.checkout'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const result = await checkOut(scope.tenantId, scope.user.id, {
        stayId: asString(req.body?.stayId, 'stayId') ?? undefined,
        roomId: asString(req.body?.roomId, 'roomId') ?? undefined,
        allowOutstanding: Boolean(req.body?.allowOutstanding),
      });
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'frontdesk.check_out',
        entityType: 'guest_stay',
        entityId: result.stay.id,
        metadata: {
          outstanding: result.outstanding,
          housekeepingTaskId: result.housekeepingTaskId,
          cctvVerificationRequested: result.cctvVerificationRequested,
        },
        ip: req.ip,
      });
      sendData(res, result);
    })
  );

  router.get(
    '/requests',
    requirePermission('guest.read'),
    asyncRoute(async (req, res) => {
      const requests = await listGuestRequests(
        getScope(req).tenantId,
        req.query.status ? String(req.query.status) : null
      );
      sendData(res, { requests }, { count: requests.length });
    })
  );

  router.post(
    '/requests',
    requirePermission('guest.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const request = await createGuestRequest(scope.tenantId, branchId, scope.user.id, {
        guestId: asString(req.body?.guestId, 'guestId'),
        stayId: asString(req.body?.stayId, 'stayId'),
        category: asString(req.body?.category, 'category', { max: 40 }) ?? 'OTHER',
        description: asString(req.body?.description, 'description', { required: true, max: 1000 }) as string,
        priority: asString(req.body?.priority, 'priority', { max: 20 }) ?? 'NORMAL',
      });
      sendCreated(res, { request });
    })
  );

  router.patch(
    '/requests/:id',
    requirePermission('guest.write'),
    asyncRoute(async (req, res) => {
      const status = asString(req.body?.status, 'status', { required: true, max: 20 }) as string;
      const request = await resolveGuestRequest(getScope(req).tenantId, req.params.id, status);
      sendData(res, { request });
    })
  );

  router.use(apiErrorHandler);
  return router;
}

/** /api/check-in — thin aliases for the dedicated front-office endpoints. */
export function createCheckInRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/arrivals',
    requirePermission('reservation.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const rows = await arrivals(scope.tenantId, scope.branchId);
      sendData(res, { arrivals: rows }, { count: rows.length });
    })
  );

  router.post(
    '/',
    requirePermission('frontdesk.checkin'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const stay = await checkIn(scope.tenantId, branchId, scope.user.id, {
        reservationId: asString(req.body?.reservationId, 'reservationId') ?? undefined,
        guestId: asString(req.body?.guestId, 'guestId') ?? undefined,
        roomId: asString(req.body?.roomId, 'roomId') ?? undefined,
        roomCharge: asMoney(req.body?.roomCharge, 'roomCharge', { min: 0 }),
        notes: asString(req.body?.notes, 'notes', { max: 1000 }),
      });
      await recordAudit({
        tenantId: scope.tenantId,
        branchId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'frontdesk.check_in',
        entityType: 'guest_stay',
        entityId: stay.id,
        ip: req.ip,
      });
      sendCreated(res, { stay });
    })
  );

  router.use(apiErrorHandler);
  return router;
}

/** /api/check-out */
export function createCheckOutRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/departures',
    requirePermission('reservation.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const rows = await departures(scope.tenantId, scope.branchId);
      sendData(res, { departures: rows }, { count: rows.length });
    })
  );

  router.post(
    '/',
    requirePermission('frontdesk.checkout'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const result = await checkOut(scope.tenantId, scope.user.id, {
        stayId: asString(req.body?.stayId, 'stayId') ?? undefined,
        roomId: asString(req.body?.roomId, 'roomId') ?? undefined,
        allowOutstanding: Boolean(req.body?.allowOutstanding),
      });
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'frontdesk.check_out',
        entityType: 'guest_stay',
        entityId: result.stay.id,
        metadata: { outstanding: result.outstanding },
        ip: req.ip,
      });
      sendData(res, result);
    })
  );

  router.use(apiErrorHandler);
  return router;
}
