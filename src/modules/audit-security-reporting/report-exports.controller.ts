import type { NextFunction, Request, Response } from 'express';
import { listExportReportsQuerySchema } from './dto/export-security-reports.dto.js';
import { reportExportsService } from './report-exports.service.js';

export const reportExportsController = {
  async exportReport(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const data = await reportExportsService.exportReport(userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async listExports(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const query = listExportReportsQuerySchema.parse(req.query);
      const data = await reportExportsService.listExports(userId, query);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async getExportDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const data = await reportExportsService.getExportDetail(userId, req.params.id as string);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async downloadReport(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const file = await reportExportsService.downloadReport(userId, req.params.id as string);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.status(200).send(file.content);
    } catch (err) {
      next(err);
    }
  },

  async revokeExport(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const data = await reportExportsService.revokeExport(
        userId,
        req.params.id as string,
        req.body.reason,
      );
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
