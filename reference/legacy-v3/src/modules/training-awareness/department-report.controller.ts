import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { departmentReportQuerySchema } from './dto/department-report.dto.js';
import { departmentReportService } from './department-report.service.js';

export const getDepartmentReport: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await departmentReportService.get(
    departmentReportQuerySchema.parse(req.query),
    req.auth,
  );
  res.json({ success: true, data });
};
