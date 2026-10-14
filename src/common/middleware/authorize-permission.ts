import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { accessControlService } from '../../modules/access-control/access-control.service.js';

const userIdSchema = z.uuid();

export function authorizePermission(permissionCode: string): RequestHandler {
  return async (_req, res, next) => {
    try {
      const userId = userIdSchema.parse(res.locals.authenticatedUserId);
      if (!(await accessControlService.hasPermission(userId, permissionCode))) {
        next(new AppError(403, 'FORBIDDEN', 'Insufficient permission'));
        return;
      }
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}
