/**
 * Occupancy intelligence. Deterministic results are stored evidence; they do
 * not mutate room lifecycle without an authorised workflow.
 */

import express, { Router } from 'express';
import { getPool } from '../db/pool';
import { listOccupancyStates } from '../db/cctvStore';
import { recordAudit } from '../db/auditStore';
import { apiErrorHandler, asyncRoute, sendData } from '../http/respond';
import {
  AuthedRequest,
  getScope,
  requireAuth,
  requirePermission,
  resolveTenantScope,
} from '../middleware/auth';

export function createOccupancyRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/states',
    requirePermission('cctv.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const states = await listOccupancyStates(
        scope.tenantId,
        req.query.roomId ? String(req.query.roomId) : null
      );
      sendData(res, { states }, { count: states.length });
    })
  );

  /** Latest deterministic state per room, for the room-intelligence view. */
  router.get(
    '/rooms',
    requirePermission('cctv.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const result = await getPool().query(
        `SELECT DISTINCT ON (s.room_id)
                s.id, s.room_id, rm.room_number, s.computed_count,
                s.registered_guest_count, s.confidence, s.derived_lifecycle_state,
                s.requires_review, s.created_at
           FROM occupancy_states s
           JOIN rooms rm ON rm.id = s.room_id
          WHERE s.tenant_id = $1
          ORDER BY s.room_id, s.created_at DESC`,
        [scope.tenantId]
      );
      sendData(res, { rooms: result.rows }, { count: result.rowCount });
    })
  );

  /** Analyst review decision. Evidence only — never a room status change. */
  router.patch(
    '/states/:id/review',
    requirePermission('cctv.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const decision = String(req.body?.decision ?? '').toUpperCase();
      if (!['CONFIRMED', 'DISMISSED'].includes(decision)) {
        res.status(422).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Review decision is required.',
            fieldErrors: { decision: 'Use CONFIRMED or DISMISSED.' },
            requestId: 'review',
          },
        });
        return;
      }
      const result = await getPool().query(
        `UPDATE occupancy_states
            SET requires_review = false
          WHERE tenant_id = $1 AND id = $2
          RETURNING *`,
        [scope.tenantId, req.params.id]
      );
      if (!result.rows[0]) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Occupancy state not found.' } });
        return;
      }
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: `cctv.occupancy_${decision.toLowerCase()}`,
        entityType: 'occupancy_state',
        entityId: req.params.id,
        ip: req.ip,
      });
      sendData(res, { state: result.rows[0] });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
