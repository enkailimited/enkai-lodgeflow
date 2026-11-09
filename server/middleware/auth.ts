import { NextFunction, Request, Response } from 'express';
import { sendError } from '../http/respond';
import { UserContext, Permission } from '../../packages/shared/src/types/lodgeflow';

// Mock authentication context for now (Replace with real session/JWT validation)
export function authorize(requiredPermission?: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    // This is a placeholder for actual session validation.
    // In production, this would validate a JWT or session cookie and load the UserContext.
    const user: UserContext | undefined = (req as any).user;

    if (!user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
    }

    if (requiredPermission && !user.permissions.includes(requiredPermission)) {
      return sendError(res, 403, 'FORBIDDEN', 'Insufficient permissions.');
    }

    next();
  };
}
