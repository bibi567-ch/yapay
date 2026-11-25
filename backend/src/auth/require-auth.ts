import type { RequestHandler } from 'express';
import { verifyAccessToken } from './tokens.js';
import type { UserRole } from './tokens.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        businessId: string;
        role: UserRole;
      };
    }
  }
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  const authorization = request.header('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) {
    response.status(401).json({ error: { code: 'unauthorized', message: 'Authentication is required.' } });
    return;
  }

  const claims = await verifyAccessToken(match[1]);
  if (!claims) {
    response.status(401).json({ error: { code: 'unauthorized', message: 'The access token is invalid or expired.' } });
    return;
  }

  request.auth = claims;
  next();
};

/**
 * Control de acceso basado en roles (RBAC). Debe usarse después de requireAuth.
 * Responde 403 cuando el usuario autenticado no tiene uno de los roles permitidos.
 */
export function requireRole(...allowed: UserRole[]): RequestHandler {
  return (request, response, next) => {
    const role = request.auth?.role;
    if (!role) {
      response.status(401).json({ error: { code: 'unauthorized', message: 'Authentication is required.' } });
      return;
    }
    if (!allowed.includes(role)) {
      response.status(403).json({ error: { code: 'forbidden', message: 'Your role does not allow this action.' } });
      return;
    }
    next();
  };
}
