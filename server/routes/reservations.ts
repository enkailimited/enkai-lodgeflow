/**
 * Reservations, availability and the booking calendar feed.
 */

import express, { Router } from 'express';
import {
  cancelReservation,
  createReservation,
  getReservation,
  listAvailableRooms,
  listReservations,
  updateReservation,
} from '../db/guestStore';
import { recordAudit } from '../db/auditStore';
import { getPool } from '../db/pool';
import { resolveScopeBranch } from '../db/roomStore';
import { RoomDbError } from '../db/errors';
import { apiErrorHandler, asyncRoute, sendCreated, sendData } from '../http/respond';
import {
  AuthedRequest,
  getScope,
  requireAuth,
  requirePermission,
  resolveTenantScope,
} from '../middleware/auth';
import { asDate, asInt, asMoney, asString, pagination } from '../validation/common';

export function createReservationsRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/availability',
    requirePermission('reservation.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const checkIn = asDate(req.query.checkIn, 'checkIn') as string;
      const checkOut = asDate(req.query.checkOut, 'checkOut') as string;
      if (checkOut <= checkIn) {
        throw new RoomDbError('INVALID_ROOM_DATA', 'Check-out must be after check-in.');
      }
      const rooms = await listAvailableRooms(scope.tenantId, branchId, checkIn, checkOut);
      sendData(res, { rooms }, { count: rooms.length });
    })
  );

  router.get(
    '/',
    requirePermission('reservation.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const { limit, offset } = pagination(req.query);
      const result = await listReservations(scope.tenantId, {
        branchId: scope.branchId,
        status: req.query.status ? String(req.query.status) : null,
        from: req.query.from ? String(req.query.from) : null,
        to: req.query.to ? String(req.query.to) : null,
        guestId: req.query.guestId ? String(req.query.guestId) : null,
        limit,
        offset,
      });
      sendData(res, result, { count: result.reservations.length, total: result.total });
    })
  );

  router.post(
    '/',
    requirePermission('reservation.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const checkIn = asDate(req.body?.checkInDate, 'checkInDate') as string;
      const checkOut = asDate(req.body?.checkOutDate, 'checkOutDate') as string;
      if (checkOut <= checkIn) {
        throw new RoomDbError('INVALID_ROOM_DATA', 'Check-out must be after check-in.');
      }

      const reservation = await createReservation(scope.tenantId, branchId, scope.user.id, {
        guestId: asString(req.body?.guestId, 'guestId', { required: true }) as string,
        roomId: asString(req.body?.roomId, 'roomId', { required: true }) as string,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: asInt(req.body?.adults, 'adults', { min: 1, max: 20, fallback: 1 }) as number,
        children: asInt(req.body?.children, 'children', { min: 0, max: 20, fallback: 0 }) as number,
        source: asString(req.body?.source, 'source', { max: 40 }) ?? 'DIRECT',
        rateAmount: asMoney(req.body?.rateAmount, 'rateAmount', { min: 0 }),
        ratePlan: asString(req.body?.ratePlan, 'ratePlan', { max: 80 }),
        notes: asString(req.body?.notes, 'notes', { max: 2000 }),
        status: req.body?.status === 'PENDING' ? 'PENDING' : 'CONFIRMED',
      });

      await recordAudit({
        tenantId: scope.tenantId,
        branchId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'reservation.created',
        entityType: 'reservation',
        entityId: reservation.id,
        metadata: { roomId: reservation.roomId, checkIn, checkOut },
        ip: req.ip,
      });
      sendCreated(res, { reservation });
    })
  );

  router.get(
    '/:id',
    requirePermission('reservation.read'),
    asyncRoute(async (req, res) => {
      const reservation = await getReservation(getScope(req).tenantId, req.params.id);
      sendData(res, { reservation });
    })
  );

  router.patch(
    '/:id',
    requirePermission('reservation.write'),
    asyncRoute(async (req, res) => {
      const validation = req.body?.status;
      if (
        validation !== undefined &&
        !['PENDING', 'CONFIRMED', 'NO_SHOW'].includes(validation)
      ) {
        throw new RoomDbError('INVALID_STATUS', 'That status cannot be set through this endpoint.');
      }
      const reservation = await updateReservation(getScope(req).tenantId, req.params.id, {
        roomId: asString(req.body?.roomId, 'roomId', { max: 80 }) ?? undefined,
        checkInDate: req.body?.checkInDate ? (asDate(req.body.checkInDate, 'checkInDate') as string) : undefined,
        checkOutDate: req.body?.checkOutDate ? (asDate(req.body.checkOutDate, 'checkOutDate') as string) : undefined,
        adults: asInt(req.body?.adults, 'adults', { min: 1, max: 20 }) ?? undefined,
        children: asInt(req.body?.children, 'children', { min: 0, max: 20 }) ?? undefined,
        source: asString(req.body?.source, 'source', { max: 40 }) ?? undefined,
        rateAmount: asMoney(req.body?.rateAmount, 'rateAmount', { min: 0 }),
        ratePlan: asString(req.body?.ratePlan, 'ratePlan', { max: 80 }),
        notes: asString(req.body?.notes, 'notes', { max: 2000 }),
        status: validation,
      });
      sendData(res, { reservation });
    })
  );

  router.post(
    '/:id/cancel',
    requirePermission('reservation.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const reservation = await cancelReservation(
        scope.tenantId,
        req.params.id,
        asString(req.body?.reason, 'reason', { max: 500 })
      );
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'reservation.cancelled',
        entityType: 'reservation',
        entityId: req.params.id,
        ip: req.ip,
      });
      sendData(res, { reservation });
    })
  );

  /** Calendar feed: all active reservations in a date window. */
  router.get(
    '/calendar/feed',
    requirePermission('reservation.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const from = req.query.from ? String(req.query.from) : new Date().toISOString().slice(0, 10);
      const to = req.query.to ? String(req.query.to) : from;
      const result = await getPool().query(
        `SELECT r.id, r.room_id, r.status, r.check_in_date::text AS check_in_date,
                r.check_out_date::text AS check_out_date, g.full_name AS guest_name,
                rm.room_number
           FROM reservations r
           JOIN guests g ON g.id = r.guest_id
           JOIN rooms rm ON rm.id = r.room_id
          WHERE r.tenant_id = $1
            AND ($2::text IS NULL OR r.branch_id = $2)
            AND r.check_out_date >= $3::date
            AND r.check_in_date <= $4::date
          ORDER BY r.check_in_date, rm.room_number`,
        [scope.tenantId, scope.branchId, from, to]
      );
      sendData(res, { entries: result.rows }, { count: result.rowCount });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
