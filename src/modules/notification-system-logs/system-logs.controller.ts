import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { searchSystemLogsQuerySchema } from './dto/search-system-logs.dto.js';
import { systemLogsService } from './system-logs.service.js';
import { exportInvestigationLogsSchema } from './dto/export-investigation-logs.dto.js';
import { configurationHistoryQuerySchema } from './dto/configuration-history.dto.js';

export const searchSystemLogs: RequestHandler = async (req, res) => {
  const actorUserId: unknown = res.locals.authenticatedUserId;
  if (typeof actorUserId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await systemLogsService.search(
    actorUserId,
    searchSystemLogsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const exportInvestigationLogs: RequestHandler = async (req, res) => {
  const actorUserId: unknown = res.locals.authenticatedUserId;
  if (typeof actorUserId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const result = await systemLogsService.export(
    actorUserId,
    exportInvestigationLogsSchema.parse(req.body),
  );
  res.setHeader('Content-Type', result.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="investigation-logs-${result.exportId}.${result.extension}"`,
  );
  res.setHeader('Content-Digest', result.contentDigest);
  res.setHeader('X-Content-SHA256', result.contentSha256);
  res.setHeader('X-Export-Record-Count', String(result.recordCount));
  res.status(200).send(result.content);
};
export const configurationHistory: RequestHandler = async (req, res) => {
  const actorUserId: unknown = res.locals.authenticatedUserId;
  if (typeof actorUserId !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await systemLogsService.configurationHistory(actorUserId, configurationHistoryQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
};
