/**
 * Housekeeping, room inspections and maintenance.
 *
 * Room readiness is decided by this workflow — never by CCTV. A passed
 * inspection moves the room to READY; front desk releases it to AVAILABLE.
 */

import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from './pool';
import { RoomDbError } from './errors';
import { recordAudit } from './auditStore';

function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export interface HousekeepingTask {
  id: string;
  tenantId: string;
  branchId: string;
  roomId: string;
  roomNumber: string;
  stayId: string | null;
  taskType: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  assignedToName: string | null;
  notes: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  inspectedBy: string | null;
  inspectionNotes: string | null;
}

function mapTask(row: any): HousekeepingTask {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    roomId: row.room_id,
    roomNumber: row.room_number,
    stayId: row.stay_id,
    taskType: row.task_type,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    notes: row.notes,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    inspectedBy: row.inspected_by,
    inspectionNotes: row.inspection_notes,
  };
}

const TASK_SELECT = `
  SELECT t.*, rm.room_number, u.display_name AS assigned_to_name
    FROM housekeeping_tasks t
    JOIN rooms rm ON rm.id = t.room_id
    LEFT JOIN users u ON u.id = t.assigned_to
`;

export async function listHousekeepingTasks(
  tenantId: string,
  opts: { branchId?: string | null; status?: string | null; roomId?: string | null } = {}
): Promise<HousekeepingTask[]> {
  const result = await getPool().query(
    `${TASK_SELECT}
      WHERE t.tenant_id = $1
        AND ($2::text IS NULL OR t.branch_id = $2)
        AND ($3::text IS NULL OR t.status = $3)
        AND ($4::text IS NULL OR t.room_id = $4)
      ORDER BY
        CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
        t.created_at DESC`,
    [tenantId, opts.branchId ?? null, opts.status ?? null, opts.roomId ?? null]
  );
  return result.rows.map(mapTask);
}

export async function createHousekeepingTask(
  tenantId: string,
  branchId: string,
  userId: string,
  input: {
    roomId: string;
    taskType?: string;
    priority?: string;
    assignedTo?: string | null;
    notes?: string | null;
    stayId?: string | null;
  }
): Promise<HousekeepingTask> {
  const room = await getPool().query(
    'SELECT id, status FROM rooms WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL',
    [input.roomId, tenantId]
  );
  if (!room.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Room not found for this business.');

  if (input.assignedTo) {
    const staff = await getPool().query(
      'SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 AND status = $3',
      [input.assignedTo, tenantId, 'ACTIVE']
    );
    if (!staff.rows[0]) throw new RoomDbError('INVALID_ROOM_DATA', 'Assigned staff member not found.');
  }

  const id = newId('hk');
  await getPool().query(
    `INSERT INTO housekeeping_tasks
       (id, tenant_id, branch_id, room_id, stay_id, task_type, status, priority,
        assigned_to, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10)`,
    [
      id, tenantId, branchId, input.roomId, input.stayId ?? null,
      input.taskType ?? 'STAYOVER', input.priority ?? 'NORMAL',
      input.assignedTo ?? null, input.notes ?? null, userId,
    ]
  );

  const result = await getPool().query(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  return mapTask(result.rows[0]);
}

export async function startHousekeepingTask(
  tenantId: string,
  taskId: string,
  userId: string
): Promise<HousekeepingTask> {
  return withTransaction(async (client) => {
    const task = await client.query(
      `UPDATE housekeeping_tasks
          SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, now()),
              assigned_to = COALESCE(assigned_to, $3)
        WHERE tenant_id = $1 AND id = $2 AND status = 'PENDING'
        RETURNING room_id`,
      [tenantId, taskId, userId]
    );
    if (!task.rows[0]) {
      throw new RoomDbError('INVALID_STATUS', 'Only pending tasks can be started.');
    }
    await client.query(
      `UPDATE rooms SET status = 'CLEANING', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [task.rows[0].room_id, tenantId]
    );
    const result = await client.query(`${TASK_SELECT} WHERE t.id = $1`, [taskId]);
    return mapTask(result.rows[0]);
  });
}

export async function submitForInspection(
  tenantId: string,
  taskId: string
): Promise<HousekeepingTask> {
  return withTransaction(async (client) => {
    const task = await client.query(
      `UPDATE housekeeping_tasks
          SET status = 'INSPECTION', completed_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'IN_PROGRESS'
        RETURNING room_id`,
      [tenantId, taskId]
    );
    if (!task.rows[0]) {
      throw new RoomDbError('INVALID_STATUS', 'Only in-progress tasks can be submitted for inspection.');
    }
    await client.query(
      `UPDATE rooms SET status = 'INSPECTION', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [task.rows[0].room_id, tenantId]
    );
    const result = await client.query(`${TASK_SELECT} WHERE t.id = $1`, [taskId]);
    return mapTask(result.rows[0]);
  });
}

export async function inspectRoom(
  tenantId: string,
  branchId: string,
  taskId: string,
  inspectorId: string,
  passed: boolean,
  notes: string | null
): Promise<{ task: HousekeepingTask; roomStatus: string }> {
  return withTransaction(async (client) => {
    const task = await client.query(
      `SELECT room_id, status FROM housekeeping_tasks
        WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, taskId]
    );
    if (!task.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Housekeeping task not found.');
    if (!['IN_PROGRESS', 'INSPECTION'].includes(task.rows[0].status)) {
      throw new RoomDbError('INVALID_STATUS', 'This task is not awaiting inspection.');
    }

    const roomStatus = passed ? 'READY' : 'DIRTY';

    await client.query(
      `UPDATE housekeeping_tasks
          SET status = $3, inspected_by = $4, inspection_notes = $5,
              completed_at = CASE WHEN $3 = 'COMPLETED' THEN now() ELSE completed_at END
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, taskId, passed ? 'COMPLETED' : 'FAILED', inspectorId, notes]
    );

    await client.query(
      `INSERT INTO room_inspections
         (id, tenant_id, branch_id, task_id, room_id, passed, notes, inspected_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId('insp'), tenantId, branchId, taskId, task.rows[0].room_id, passed, notes, inspectorId]
    );

    await client.query(
      `UPDATE rooms SET status = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [task.rows[0].room_id, tenantId, roomStatus]
    );

    const result = await client.query(`${TASK_SELECT} WHERE t.id = $1`, [taskId]);
    return { task: mapTask(result.rows[0]), roomStatus };
  });
}

/** Release an inspected room to sellable inventory. */
export async function markRoomAvailable(
  tenantId: string,
  roomId: string,
  userId: string
): Promise<{ roomId: string; status: string }> {
  const result = await getPool().query(
    `UPDATE rooms
        SET status = 'AVAILABLE', updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status IN ('READY', 'CLEANING', 'INSPECTION')
      RETURNING id, status`,
    [tenantId, roomId]
  );
  if (!result.rows[0]) {
    throw new RoomDbError('INVALID_STATUS', 'Only READY, CLEANING or INSPECTION rooms can be released.');
  }
  await recordAudit({
    tenantId,
    actorUserId: userId,
    action: 'room.released',
    entityType: 'room',
    entityId: roomId,
    metadata: { status: 'AVAILABLE' },
  });
  return { roomId: result.rows[0].id, status: result.rows[0].status };
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export async function listMaintenanceRequests(tenantId: string, status?: string | null): Promise<any[]> {
  const result = await getPool().query(
    `SELECT m.*, rm.room_number
       FROM maintenance_requests m
       LEFT JOIN rooms rm ON rm.id = m.room_id
      WHERE m.tenant_id = $1 AND ($2::text IS NULL OR m.status = $2)
      ORDER BY m.created_at DESC`,
    [tenantId, status ?? null]
  );
  return result.rows;
}

export async function createMaintenanceRequest(
  tenantId: string,
  branchId: string,
  userId: string,
  input: { roomId?: string | null; title: string; description?: string | null; priority?: string }
): Promise<any> {
  return withTransaction(async (client) => {
    const id = newId('mnt');
    const result = await client.query(
      `INSERT INTO maintenance_requests
         (id, tenant_id, branch_id, room_id, title, description, status, priority, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, $8)
       RETURNING *`,
      [id, tenantId, branchId, input.roomId ?? null, input.title, input.description ?? null, input.priority ?? 'NORMAL', userId]
    );

    if (input.roomId && input.priority !== 'LOW') {
      await client.query(
        `UPDATE rooms SET status = 'MAINTENANCE', updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('OCCUPIED', 'OUT_OF_SERVICE')`,
        [input.roomId, tenantId]
      );
    }
    return result.rows[0];
  });
}

export async function updateMaintenanceStatus(
  tenantId: string,
  id: string,
  status: string,
  userId: string
): Promise<any> {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE maintenance_requests
          SET status = $3, resolved_at = CASE WHEN $3 = 'RESOLVED' THEN now() ELSE resolved_at END,
              assigned_to = COALESCE(assigned_to, $4)
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      [tenantId, id, status, userId]
    );
    if (!result.rows[0]) throw new RoomDbError('ROOM_NOT_FOUND', 'Maintenance request not found.');

    if (status === 'RESOLVED' && result.rows[0].room_id) {
      await client.query(
        `UPDATE rooms SET status = 'DIRTY', updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND status = 'MAINTENANCE'`,
        [result.rows[0].room_id, tenantId]
      );
    }
    return result.rows[0];
  });
}
