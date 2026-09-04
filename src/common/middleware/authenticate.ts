import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';

type AccessClaims = jwt.JwtPayload & {
  sub: string;
  type: 'access';
  roles: string[];
  permissions: string[];
};

export const authenticate: RequestHandler = (req, _res, next) => {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'securaai-api',
      audience: 'securaai-client',
    }) as AccessClaims;
    if (claims.type !== 'access' || !claims.sub) throw new Error('Invalid token type');
    req.auth = { userId: claims.sub, roles: claims.roles, permissions: claims.permissions };
    next();
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired');
  }
};

export const authorize = (...permissions: string[]): RequestHandler => (req, _res, next) => {
  if (!req.auth || !permissions.every((permission) => req.auth?.permissions.includes(permission))) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
  next();
};
