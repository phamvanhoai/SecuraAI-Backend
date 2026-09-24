import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} was not found`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  let appError: AppError;
  if (error instanceof AppError) appError = error;
  else if (error instanceof ZodError)
    appError = new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', error.issues);
  else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    appError = new AppError(409, 'RESOURCE_CONFLICT', 'A unique resource already exists');
  else appError = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');

  if (appError.statusCode >= 500) logger.error({ err: error, requestId: req.id }, 'Request failed');
  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined && { details: appError.details }),
      ...(env.NODE_ENV === 'development' && error instanceof Error && { stack: error.stack }),
    },
    requestId: req.id,
  });
};
