import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { auditLogsService } from './audit-logs.service.js';
import { getAuditLogParamsSchema, listAuditLogsQuerySchema } from './dto/list-audit-logs.dto.js';

function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return value;
}

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const query = listAuditLogsQuerySchema.parse(req.query);
  const result = await auditLogsService.listAuditLogs(userId, query);
  res.status(200).json({ success: true, data: result });
}

export async function getAuditLogDetail(req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getAuditLogParamsSchema.parse(req.params);
  const result = await auditLogsService.getAuditLogDetail(userId, params.id);
  res.status(200).json({ success: true, data: result });
}

export async function getAuditLogDiff(req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getAuditLogParamsSchema.parse(req.params);
  const result = await auditLogsService.getAuditLogDiff(userId, params.id);
  res.status(200).json({ success: true, data: result });
}

