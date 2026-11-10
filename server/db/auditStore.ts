/**
 * Audit trail. Security-relevant actions append one immutable row.
 */

import { randomUUID } from 'node:crypto';
import { getPool } from './pool';

export interface AuditInput {
  tenantId?: string | null;
  branchId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO audit_logs
         (id, tenant_id, branch_id, actor_user_id, actor_email,
          action, entity_type, entity_id, metadata, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
      [
        randomUUID(),
        input.tenantId ?? null,
        input.branchId ?? null,
        input.actorUserId ?? null,
        input.actorEmail ?? null,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.ip ?? null,
      ]
    );
  } catch (error) {
    // Auditing must never take down the request it is describing.
    console.error('[audit] failed to record event:', error instanceof Error ? error.message : error);
  }
}

export async function listAuditLogs(scope: {
  tenantId: string | null;
  limit?: number;
  offset?: number;
}): Promise<Array<Record<string, unknown>>> {
  const limit = Math.min(Math.max(scope.limit ?? 50, 1), 200);
  const offset = Math.max(scope.offset ?? 0, 0);

  const result = await getPool().query(
    `SELECT id, tenant_id, branch_id, actor_user_id, actor_email,
            action, entity_type, entity_id, metadata, ip, created_at
       FROM audit_logs
      WHERE ($1::text IS NULL OR tenant_id = $1)
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [scope.tenantId, limit, offset]
  );

  return result.rows;
}
