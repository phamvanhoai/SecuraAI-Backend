import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { auditLogsService } from './audit-logs.service.js';
import { listAuditLogsQuerySchema } from './dto/list-audit-logs.dto.js';

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
