import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';
import { accountAccessService } from '../../modules/auth/index.js';
import { z } from 'zod';

const accessClaimsSchema = z.object({
  sub: z.string().min(1),
  type: z.literal('access'),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  accountLockVersion: z.string().optional(),
});

export const authenticate: RequestHandler = async (req, _res, next) => {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token)
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  let claims: z.infer<typeof accessClaimsSchema>;
  try {
    claims = accessClaimsSchema.parse(
      jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: 'securaai-api',
        audience: 'securaai-client',
      }),
    );
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired');
  }
  await accountAccessService.verify(claims.sub, claims.accountLockVersion);
  req.auth = { userId: claims.sub, roles: claims.roles, permissions: claims.permissions };
  next();
};

export const authorize =
  (...permissions: string[]): RequestHandler =>
  (req, _res, next) => {
    if (
      !req.auth ||
      !permissions.every((permission) => req.auth?.permissions.includes(permission))
    ) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    next();
  };
