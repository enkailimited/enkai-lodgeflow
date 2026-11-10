/**
 * CCTV intelligence persistence.
 *
 * This module stores evidence. It deliberately never updates room lifecycle,
 * reservations, stays or finance — those transitions belong to their own
 * authorised workflows.
 */

import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from './pool';
import { RoomDbError } from './errors';

function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export interface Camera {
  id: string;
  tenantId: string;
  branchId: string;
  roomId: string | null;
  roomNumber: string | null;
  name: string;
  location: string | null;
  status: string;
  mode: string;
  rtspConfigured: boolean;
  createdAt: string;
}

function mapCamera(row: any): Camera {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    roomId: row.room_id,
    roomNumber: row.room_number ?? null,
    name: row.name,
    location: row.location,
    status: row.status,
    mode: row.mode,
    rtspConfigured: Boolean(row.rtsp_url),
    createdAt: row.created_at,
  };
}

export async function listCameras(tenantId: string, branchId: string | null): Promise<Camera[]> {
  const result = await getPool().query(
    `SELECT c.*, rm.room_number
       FROM cameras c
       LEFT JOIN rooms rm ON rm.id = c.room_id
      WHERE c.tenant_id = $1 AND ($2::text IS NULL OR c.branch_id = $2)
      ORDER BY c.name`,
    [tenantId, branchId]
  );
  return result.rows.map(mapCamera);
}

export async function createCamera(
  tenantId: string,
  branchId: string,
  input: {
    name: string;
    location?: string | null;
    roomId?: string | null;
    rtspUrl?: string | null;
    mode?: 'UPLOAD_PROTOTYPE' | 'RTSP';
    status?: string;
  }
): Promise<Camera> {
  if (input.roomId) {
    const room = await getPool().query(
      'SELECT 1 FROM rooms WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL',
      [input.roomId, tenantId]
    );
    if (!room.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Room not found for this business.');
  }

  const mode = input.mode ?? (input.rtspUrl ? 'RTSP' : 'UPLOAD_PROTOTYPE');
  const result = await getPool().query(
    `INSERT INTO cameras
       (id, tenant_id, branch_id, room_id, name, location, rtsp_url, status, mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      newId('cam'), tenantId, branchId, input.roomId ?? null, input.name,
      input.location ?? null, input.rtspUrl ?? null,
      input.status ?? (input.rtspUrl ? 'OFFLINE' : 'UNCONFIGURED'), mode,
    ]
  );
  return mapCamera({ ...result.rows[0], room_number: null });
}

export async function updateCamera(
  tenantId: string,
  id: string,
  patch: Partial<{ name: string; location: string | null; roomId: string | null; rtspUrl: string | null; status: string; mode: string }>
): Promise<Camera> {
  const result = await getPool().query(
    `UPDATE cameras SET
       name = COALESCE($3, name),
       location = COALESCE($4, location),
       room_id = COALESCE($5, room_id),
       rtsp_url = COALESCE($6, rtsp_url),
       status = COALESCE($7, status),
       mode = COALESCE($8, mode),
       updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [
      tenantId, id, patch.name ?? null, patch.location ?? null, patch.roomId ?? null,
      patch.rtspUrl ?? null, patch.status ?? null, patch.mode ?? null,
    ]
  );
  if (!result.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Camera not found.');
  return mapCamera(result.rows[0]);
}

export async function deleteCamera(tenantId: string, id: string): Promise<void> {
  const result = await getPool().query('DELETE FROM cameras WHERE tenant_id = $1 AND id = $2 RETURNING id', [
    tenantId,
    id,
  ]);
  if (!result.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Camera not found.');
}

// ---------------------------------------------------------------------------
// Analysis jobs
// ---------------------------------------------------------------------------

export async function listAnalysisJobs(tenantId: string, branchId: string | null): Promise<any[]> {
  const result = await getPool().query(
    `SELECT j.*, c.name AS camera_name, rm.room_number
       FROM video_analysis_jobs j
       LEFT JOIN cameras c ON c.id = j.camera_id
       LEFT JOIN rooms rm ON rm.id = j.room_id
      WHERE j.tenant_id = $1 AND ($2::text IS NULL OR j.branch_id = $2)
      ORDER BY j.created_at DESC LIMIT 100`,
    [tenantId, branchId]
  );
  return result.rows;
}

export async function createAnalysisJob(
  tenantId: string,
  branchId: string,
  userId: string,
  input: {
    cameraId?: string | null;
    roomId?: string | null;
    recordingId?: string | null;
    filename?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    storagePath?: string | null;
  }
): Promise<{ jobId: string; recordingId: string | null }> {
  return withTransaction(async (client) => {
    let recordingId = input.recordingId ?? null;
    if (!recordingId && input.filename) {
      recordingId = newId('rec');
      await client.query(
        `INSERT INTO video_recordings
           (id, tenant_id, branch_id, camera_id, room_id, filename, mime_type, size_bytes, storage_path, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          recordingId, tenantId, branchId, input.cameraId ?? null, input.roomId ?? null,
          input.filename, input.mimeType ?? null, input.sizeBytes ?? null,
          input.storagePath ?? null, userId,
        ]
      );
    }

    const jobId = newId('job');
    await client.query(
      `INSERT INTO video_analysis_jobs
         (id, tenant_id, branch_id, camera_id, room_id, recording_id, status, phase, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED', 'Queued for analysis', $7)`,
      [jobId, tenantId, branchId, input.cameraId ?? null, input.roomId ?? null, recordingId, userId]
    );
    return { jobId, recordingId };
  });
}

export async function markJobProcessing(
  tenantId: string,
  jobId: string,
  phase: string,
  model?: string | null
): Promise<void> {
  await getPool().query(
    `UPDATE video_analysis_jobs
        SET status = 'PROCESSING', phase = $3, model = COALESCE($4, model),
            started_at = COALESCE(started_at, now())
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, jobId, phase, model ?? null]
  );
}

export interface CompleteJobInput {
  status: 'COMPLETED' | 'FAILED' | 'NEEDS_REVIEW';
  model?: string | null;
  confidence?: number | null;
  rawOutput?: unknown;
  valid?: boolean;
  events?: Array<{
    eventType: string;
    personId?: string | null;
    videoTimestampSec?: number | null;
    confidence?: number | null;
    verified?: boolean;
  }>;
  occupancy?: {
    computedCount: number;
    registeredGuestCount?: number | null;
    derivedLifecycleState?: string | null;
    requiresReview?: boolean;
  } | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export async function completeAnalysisJob(
  tenantId: string,
  jobId: string,
  input: CompleteJobInput
): Promise<any> {
  return withTransaction(async (client) => {
    const job = await client.query(
      'SELECT * FROM video_analysis_jobs WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, jobId]
    );
    if (!job.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Analysis job not found.');
    const row = job.rows[0];

    await client.query(
      `UPDATE video_analysis_jobs
          SET status = $3, phase = $4, error_code = $5, error_message = $6,
              completed_at = now(), model = COALESCE($7, model)
        WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId, jobId, input.status,
        input.status === 'COMPLETED' ? 'Completed' : input.status,
        input.errorCode ?? null, input.errorMessage ?? null, input.model ?? null,
      ]
    );

    if (input.rawOutput !== undefined) {
      await client.query(
        `INSERT INTO gemini_analyses (id, job_id, tenant_id, model, raw_output, valid, confidence)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [
          newId('gem'), jobId, tenantId, input.model ?? null,
          JSON.stringify(input.rawOutput ?? {}), Boolean(input.valid), input.confidence ?? null,
        ]
      );
    }

    for (const event of input.events ?? []) {
      await client.query(
        `INSERT INTO occupancy_events
           (id, job_id, tenant_id, branch_id, room_id, event_type, person_id,
            video_timestamp_sec, confidence, verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          newId('evt'), jobId, tenantId, row.branch_id, row.room_id,
          event.eventType, event.personId ?? null, event.videoTimestampSec ?? null,
          event.confidence ?? null, Boolean(event.verified),
        ]
      );
    }

    if (input.occupancy && row.room_id) {
      await client.query(
        `INSERT INTO occupancy_states
           (id, tenant_id, branch_id, room_id, job_id, computed_count,
            registered_guest_count, confidence, derived_lifecycle_state, requires_review)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          newId('occ'), tenantId, row.branch_id, row.room_id, jobId,
          input.occupancy.computedCount, input.occupancy.registeredGuestCount ?? null,
          input.confidence ?? null, input.occupancy.derivedLifecycleState ?? null,
          input.occupancy.requiresReview ?? true,
        ]
      );
    }

    if (input.status === 'NEEDS_REVIEW') {
      await client.query(
        `INSERT INTO cctv_alerts
           (id, tenant_id, branch_id, camera_id, room_id, type, severity, message, status)
         VALUES ($1, $2, $3, $4, $5, 'ANALYSIS_REQUIRES_REVIEW', 'WARNING', $6, 'OPEN')`,
        [
          newId('alert'), tenantId, row.branch_id, row.camera_id, row.room_id,
          'CCTV analysis needs human review before it can support any room decision.',
        ]
      );
    }

    return { jobId, status: input.status };
  });
}

export async function getAnalysisJob(tenantId: string, jobId: string): Promise<any> {
  const job = await getPool().query(
    `SELECT j.*, c.name AS camera_name, rm.room_number
       FROM video_analysis_jobs j
       LEFT JOIN cameras c ON c.id = j.camera_id
       LEFT JOIN rooms rm ON rm.id = j.room_id
      WHERE j.tenant_id = $1 AND j.id = $2`,
    [tenantId, jobId]
  );
  if (!job.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Analysis job not found.');

  const gemini = await getPool().query(
    'SELECT * FROM gemini_analyses WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
    [jobId]
  );
  const events = await getPool().query(
    'SELECT * FROM occupancy_events WHERE job_id = $1 ORDER BY video_timestamp_sec',
    [jobId]
  );
  const occupancy = await getPool().query(
    'SELECT * FROM occupancy_states WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1',
    [jobId]
  );

  return {
    ...job.rows[0],
    gemini: gemini.rows[0] ?? null,
    events: events.rows,
    occupancy: occupancy.rows[0] ?? null,
  };
}

export async function listOccupancyStates(tenantId: string, roomId?: string | null): Promise<any[]> {
  const result = await getPool().query(
    `SELECT s.*, rm.room_number
       FROM occupancy_states s
       JOIN rooms rm ON rm.id = s.room_id
      WHERE s.tenant_id = $1 AND ($2::text IS NULL OR s.room_id = $2)
      ORDER BY s.created_at DESC LIMIT 100`,
    [tenantId, roomId ?? null]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export async function listAlerts(tenantId: string, branchId: string | null, status?: string | null): Promise<any[]> {
  const result = await getPool().query(
    `SELECT a.*, c.name AS camera_name, rm.room_number
       FROM cctv_alerts a
       LEFT JOIN cameras c ON c.id = a.camera_id
       LEFT JOIN rooms rm ON rm.id = a.room_id
      WHERE a.tenant_id = $1 AND ($2::text IS NULL OR a.branch_id = $2)
        AND ($3::text IS NULL OR a.status = $3)
      ORDER BY a.created_at DESC LIMIT 200`,
    [tenantId, branchId, status ?? null]
  );
  return result.rows;
}

export async function acknowledgeAlert(tenantId: string, id: string, userId: string): Promise<any> {
  const result = await getPool().query(
    `UPDATE cctv_alerts
        SET status = 'ACKNOWLEDGED', acknowledged_by = $3, acknowledged_at = now()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *`,
    [tenantId, id, userId]
  );
  if (!result.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'CCTV alert not found.');
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Doorway ROI
// ---------------------------------------------------------------------------

export async function saveDoorwayRoi(
  tenantId: string,
  branchId: string,
  input: { cameraId: string; roomId?: string | null; config: Record<string, unknown> }
): Promise<any> {
  return withTransaction(async (client) => {
    const existing = await client.query(
      'SELECT id FROM doorway_rois WHERE tenant_id = $1 AND camera_id = $2 LIMIT 1',
      [tenantId, input.cameraId]
    );
    if (existing.rows[0]) {
      const updated = await client.query(
        `UPDATE doorway_rois
            SET room_id = $3, config = $4::jsonb, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING *`,
        [tenantId, existing.rows[0].id, input.roomId ?? null, JSON.stringify(input.config)]
      );
      return updated.rows[0];
    }
    const created = await client.query(
      `INSERT INTO doorway_rois (id, tenant_id, branch_id, camera_id, room_id, config)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [newId('roi'), tenantId, branchId, input.cameraId, input.roomId ?? null, JSON.stringify(input.config)]
    );
    return created.rows[0];
  });
}

export async function getDoorwayRoi(tenantId: string, cameraId: string): Promise<any | null> {
  const result = await getPool().query(
    'SELECT * FROM doorway_rois WHERE tenant_id = $1 AND camera_id = $2 ORDER BY updated_at DESC LIMIT 1',
    [tenantId, cameraId]
  );
  return result.rows[0] ?? null;
}
