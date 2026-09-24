import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { env } from '../../config/env.js';

export const accessClaimsSchema = z.object({
  sub: z.uuid(),
  type: z.literal('access'),
});

export const authenticate: RequestHandler = (req, res, next) => {
  const authorization = req.headers.authorization;
  const match = typeof authorization === 'string' ? /^Bearer ([^\s]+)$/.exec(authorization) : null;
  if (!match?.[1]) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    return;
  }

  try {
    const verified: unknown = jwt.verify(match[1], env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'securaai-api',
      audience: 'securaai-client',
    });
    const claims = accessClaimsSchema.safeParse(verified);
    if (!claims.success) throw new Error('Invalid access claims');
    res.locals.authenticatedUserId = claims.data.sub;
    next();
  } catch {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
  }
};
