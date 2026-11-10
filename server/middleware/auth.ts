/**
 * Authentication and tenant-context middleware.
 *
 * Tenant context is derived from the authenticated identity, never from a
 * browser-supplied tenant id — except for audited platform elevation.
 */

import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthUser, SESSION_COOKIE, resolveSession } from '../auth/session';
import { recordAudit } from '../db/auditStore';
import { sendError } from '../http/respond';

export interface TenantScope {
  tenantId: string;
  branchId: string | null;
  user: AuthUser;
  isPlatform: boolean;
  elevation: boolean;
}

export interface AuthedRequest extends Request {
  auth?: AuthUser;
  tenantScope?: TenantScope;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf('=');
    if (index === -1) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

export function readSessionToken(req: Request): string {
  const authorization = req.header('authorization') ?? '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  const cookies = parseCookies(req.header('cookie'));
  return cookies[SESSION_COOKIE] ?? '';
}

export async function attachAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = readSessionToken(req);
    if (token) {
      req.auth = (await resolveSession(token)) ?? undefined;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.auth) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
    return;
  }
  if (req.auth.tenantId && req.auth.tenantStatus !== 'ACTIVE') {
    sendError(res, 403, 'TENANT_INACTIVE', 'This business account is not active.');
    return;
  }
  next();
}

export function requirePermission(...keys: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      sendError(res, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
      return;
    }

    // Platform staff do not automatically hold business permissions. With an
    // explicit, audited elevation (x-tenant-id + platform.tenant.access) they
    // may read tenant workspace data, but never write it.
    if (
      req.auth.tenantId === null &&
      req.tenantScope?.elevation === true &&
      req.auth.permissions.includes('platform.tenant.access') &&
      keys.every((key) => key.endsWith('.read'))
    ) {
      next();
      return;
    }

    const missing = keys.filter((key) => !req.auth?.permissions.includes(key));
    if (missing.length > 0) {
      sendError(res, 403, 'FORBIDDEN', 'You do not have permission for this action.', {
        details: { missing },
      });
      return;
    }
    next();
  };
}

export function requirePlatform(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
    return;
  }
  if (req.auth.tenantId !== null) {
    sendError(res, 403, 'FORBIDDEN', 'Platform access is required.');
    return;
  }
  next();
}

/**
 * Resolve the tenant being operated on.
 *
 * Business users always resolve to their own tenant. Platform users must name
 * a tenant explicitly and hold `platform.tenant.access`; each such access is
 * written to the audit log as an elevation event.
 */
export async function resolveTenantScope(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = req.auth;
    if (!auth) {
      sendError(res, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
      return;
    }

    let tenantId = auth.tenantId;
    let elevation = false;

    if (!tenantId) {
      const requested = String(req.header('x-tenant-id') ?? req.query.tenantId ?? '').trim();
      if (!requested) {
        sendError(res, 400, 'TENANT_REQUIRED', 'A tenant context is required for this operation.');
        return;
      }
      if (!auth.permissions.includes('platform.tenant.access')) {
        sendError(res, 403, 'FORBIDDEN', 'Elevated tenant access is not permitted.');
        return;
      }
      tenantId = requested;
      elevation = true;
      await recordAudit({
        tenantId,
        actorUserId: auth.id,
        actorEmail: auth.email,
        action: 'platform.tenant.elevate',
        entityType: 'tenant',
        entityId: tenantId,
        metadata: { path: req.originalUrl, method: req.method, requestId: randomUUID() },
        ip: req.ip,
      });
    }

    const requestedBranch = String(
      req.header('x-branch-id') ?? req.query.branchId ?? ''
    ).trim();

    if (requestedBranch && auth.branchIds.length > 0 && !auth.branchIds.includes(requestedBranch)) {
      sendError(res, 403, 'BRANCH_FORBIDDEN', 'You do not have access to that branch.');
      return;
    }

    req.tenantScope = {
      tenantId: tenantId as string,
      branchId: requestedBranch || null,
      user: auth,
      isPlatform: auth.tenantId === null,
      elevation,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function getScope(req: AuthedRequest): TenantScope {
  if (!req.tenantScope) {
    throw new Error('Tenant scope was not resolved for this request.');
  }
  return req.tenantScope;
}
