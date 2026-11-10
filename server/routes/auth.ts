/**
 * Authentication endpoints.
 *
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 */

import express, { Router } from 'express';
import { verifyPassword } from '../auth/password';
import {
  createSession,
  resolveSession,
  revokeSession,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '../auth/session';
import { recordAudit } from '../db/auditStore';
import { findUserByEmail } from '../db/tenantStore';
import { apiErrorHandler, asyncRoute, sendData, sendError } from '../http/respond';
import { attachAuth, AuthedRequest, readSessionToken, requireAuth } from '../middleware/auth';
import { asEmail, asString } from '../validation/common';

export function createAuthRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '32kb' }));
  router.use(attachAuth);

  router.post(
    '/login',
    asyncRoute(async (req, res) => {
      let email: string | null;
      let password: string | null;
      try {
        email = asEmail(req.body?.email, 'email', true);
        password = asString(req.body?.password, 'password', { required: true, max: 200 });
      } catch (error) {
        apiErrorHandler(error, req, res, () => undefined);
        return;
      }

      const user = await findUserByEmail(email as string);
      // Always run a verification so a missing account and a wrong password
      // take comparable time.
      const valid = user
        ? await verifyPassword(password as string, user.passwordHash)
        : await verifyPassword(password as string, 'scrypt$16384$8$1$00$00');

      if (!user || !valid) {
        sendError(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
        return;
      }
      if (user.status !== 'ACTIVE') {
        sendError(res, 403, 'ACCOUNT_INACTIVE', 'This account is not active.');
        return;
      }
      if (user.tenantId && user.tenantStatus !== 'ACTIVE') {
        sendError(res, 403, 'TENANT_INACTIVE', 'This business account is not active.');
        return;
      }

      const session = await createSession(user.id, {
        ip: req.ip,
        userAgent: req.header('user-agent') ?? null,
      });
      res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions());

      const auth = await resolveSession(session.token);
      await recordAudit({
        tenantId: user.tenantId,
        actorUserId: user.id,
        actorEmail: email,
        action: 'auth.login',
        ip: req.ip,
      });

      sendData(res, {
        user: auth,
        expiresAt: session.expiresAt.toISOString(),
      });
    })
  );

  router.post(
    '/logout',
    asyncRoute(async (req, res) => {
      const token = readSessionToken(req);
      if (token) await revokeSession(token);
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.status(204).end();
    })
  );

  router.get(
    '/me',
    requireAuth,
    asyncRoute(async (req: AuthedRequest, res) => {
      sendData(res, { user: req.auth });
    })
  );

  router.use(apiErrorHandler);
  return router;
}
