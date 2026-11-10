/**
 * CCTV intelligence: cameras, analysis evidence, alerts and doorway ROIs.
 *
 * The existing Gemini pipeline remains the analysis engine. These endpoints
 * persist its evidence and expose it to the dedicated CCTV workspace.
 */

import express, { Router } from 'express';
import {
  acknowledgeAlert,
  completeAnalysisJob,
  createAnalysisJob,
  createCamera,
  deleteCamera,
  getAnalysisJob,
  getDoorwayRoi,
  listAlerts,
  listAnalysisJobs,
  listCameras,
  markJobProcessing,
  saveDoorwayRoi,
  updateCamera,
} from '../db/cctvStore';
import { cctvSummary } from '../db/reportStore';
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
import { asString } from '../validation/common';

export function createCctvRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '2mb' }));
  router.use(requireAuth, resolveTenantScope);

  router.get(
    '/summary',
    requirePermission('cctv.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      sendData(res, await cctvSummary(scope.tenantId, scope.branchId));
    })
  );

  router.get(
    '/cameras',
    requirePermission('cctv.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const cameras = await listCameras(scope.tenantId, scope.branchId);
      sendData(res, { cameras }, { count: cameras.length });
    })
  );

  router.post(
    '/cameras',
    requirePermission('cctv.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const camera = await createCamera(scope.tenantId, branchId, {
        name: asString(req.body?.name, 'name', { required: true, max: 120 }) as string,
        location: asString(req.body?.location, 'location', { max: 160 }),
        roomId: asString(req.body?.roomId, 'roomId'),
        rtspUrl: asString(req.body?.rtspUrl, 'rtspUrl', { max: 500 }),
        mode: req.body?.mode === 'RTSP' ? 'RTSP' : 'UPLOAD_PROTOTYPE',
        status: asString(req.body?.status, 'status', { max: 30 }) ?? undefined,
      });
      await recordAudit({
        tenantId: scope.tenantId,
        branchId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'camera.created',
        entityType: 'camera',
        entityId: camera.id,
        ip: req.ip,
      });
      sendCreated(res, { camera });
    })
  );

  router.patch(
    '/cameras/:id',
    requirePermission('cctv.write'),
    asyncRoute(async (req, res) => {
      const camera = await updateCamera(getScope(req).tenantId, req.params.id, {
        name: asString(req.body?.name, 'name', { max: 120 }) ?? undefined,
        location: asString(req.body?.location, 'location', { max: 160 }),
        roomId: asString(req.body?.roomId, 'roomId'),
        rtspUrl: asString(req.body?.rtspUrl, 'rtspUrl', { max: 500 }),
        status: asString(req.body?.status, 'status', { max: 30 }) ?? undefined,
        mode: asString(req.body?.mode, 'mode', { max: 30 }) ?? undefined,
      });
      sendData(res, { camera });
    })
  );

  router.delete(
    '/cameras/:id',
    requirePermission('cctv.write'),
    asyncRoute(async (req, res) => {
      await deleteCamera(getScope(req).tenantId, req.params.id);
      res.status(204).end();
    })
  );

  router.get(
    '/jobs',
    requirePermission('cctv.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const jobs = await listAnalysisJobs(scope.tenantId, scope.branchId);
      sendData(res, { jobs }, { count: jobs.length });
    })
  );

  router.post(
    '/jobs',
    requirePermission('cctv.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const created = await createAnalysisJob(scope.tenantId, branchId, scope.user.id, {
        cameraId: asString(req.body?.cameraId, 'cameraId'),
        roomId: asString(req.body?.roomId, 'roomId'),
        filename: asString(req.body?.filename, 'filename', { max: 300 }),
        mimeType: asString(req.body?.mimeType, 'mimeType', { max: 120 }),
        sizeBytes: req.body?.sizeBytes === undefined ? null : Number(req.body.sizeBytes),
        storagePath: asString(req.body?.storagePath, 'storagePath', { max: 500 }),
      });
      sendCreated(res, created);
    })
  );

  router.get(
    '/jobs/:id',
    requirePermission('cctv.read'),
    asyncRoute(async (req, res) => {
      const job = await getAnalysisJob(getScope(req).tenantId, req.params.id);
      sendData(res, { job });
    })
  );

  router.post(
    '/jobs/:id/processing',
    requirePermission('cctv.write'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      await markJobProcessing(
        scope.tenantId,
        req.params.id,
        asString(req.body?.phase, 'phase', { max: 120 }) ?? 'Processing',
        asString(req.body?.model, 'model', { max: 80 })
      );
      sendData(res, { jobId: req.params.id, status: 'PROCESSING' });
    })
  );

  router.post(
    '/jobs/:id/complete',
    requirePermission('cctv.write'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const status = asString(req.body?.status, 'status', { required: true, max: 20 }) as string;
      if (!['COMPLETED', 'FAILED', 'NEEDS_REVIEW'].includes(status)) {
        res.status(422).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid analysis outcome.',
            fieldErrors: { status: 'Use COMPLETED, FAILED or NEEDS_REVIEW.' },
            requestId: 'status',
          },
        });
        return;
      }
      const result = await completeAnalysisJob(scope.tenantId, req.params.id, {
        status: status as 'COMPLETED' | 'FAILED' | 'NEEDS_REVIEW',
        model: asString(req.body?.model, 'model', { max: 80 }),
        confidence: req.body?.confidence === undefined ? null : Number(req.body.confidence),
        rawOutput: req.body?.rawOutput,
        valid: Boolean(req.body?.valid),
        events: Array.isArray(req.body?.events) ? req.body.events : [],
        occupancy: req.body?.occupancy ?? null,
        errorCode: asString(req.body?.errorCode, 'errorCode', { max: 60 }),
        errorMessage: asString(req.body?.errorMessage, 'errorMessage', { max: 1000 }),
      });
      await recordAudit({
        tenantId: scope.tenantId,
        actorUserId: scope.user.id,
        actorEmail: scope.user.email,
        action: 'cctv.analysis_completed',
        entityType: 'video_analysis_job',
        entityId: req.params.id,
        metadata: { status },
        ip: req.ip,
      });
      sendData(res, result);
    })
  );

  router.get(
    '/alerts',
    requirePermission('cctv.read'),
    asyncRoute(async (req, res) => {
      const scope = getScope(req);
      const alerts = await listAlerts(
        scope.tenantId,
        scope.branchId,
        req.query.status ? String(req.query.status) : null
      );
      sendData(res, { alerts }, { count: alerts.length });
    })
  );

  router.post(
    '/alerts/:id/acknowledge',
    requirePermission('cctv.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const alert = await acknowledgeAlert(scope.tenantId, req.params.id, scope.user.id);
      sendData(res, { alert });
    })
  );

  router.get(
    '/roi/:cameraId',
    requirePermission('cctv.read'),
    asyncRoute(async (req, res) => {
      const roi = await getDoorwayRoi(getScope(req).tenantId, req.params.cameraId);
      sendData(res, { roi });
    })
  );

  router.post(
    '/roi',
    requirePermission('cctv.write'),
    asyncRoute(async (req: AuthedRequest, res) => {
      const scope = getScope(req);
      const branchId = await resolveScopeBranch(scope);
      const roi = await saveDoorwayRoi(scope.tenantId, branchId, {
        cameraId: asString(req.body?.cameraId, 'cameraId', { required: true }) as string,
        roomId: asString(req.body?.roomId, 'roomId'),
        config: (req.body?.config ?? {}) as Record<string, unknown>,
      });
      sendData(res, { roi });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
