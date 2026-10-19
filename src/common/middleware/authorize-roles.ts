import type { RequestHandler } from 'express';
import type { user_role } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { prisma } from '../../database/prisma.js';

const userIdSchema = z.uuid();

export function authorizeRoles(...allowedRoles: readonly user_role[]): RequestHandler {
  return async (_req, res, next) => {
    try {
      const userId = userIdSchema.parse(res.locals.authenticatedUserId);
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { role: true, status: true },
      });
      if (!user || user.status !== 'ACTIVE') {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      if (!allowedRoles.includes(user.role)) {
        next(new AppError(403, 'FORBIDDEN', 'This role cannot perform this action'));
        return;
      }
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}
