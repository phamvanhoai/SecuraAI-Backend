import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import {
  exportReportRequestSchema,
  listExportReportsQuerySchema,
  revokeExportReportSchema,
} from './dto/export-security-reports.dto.js';
import { reportExportsController } from './report-exports.controller.js';

export const reportExportsRouter = Router();

reportExportsRouter.use(authenticate);

reportExportsRouter.post(
  '/',
  validate({ body: exportReportRequestSchema }),
  reportExportsController.exportReport,
);

reportExportsRouter.get(
  '/',
  validate({ query: listExportReportsQuerySchema }),
  reportExportsController.listExports,
);

reportExportsRouter.get(
  '/:id/download',
  reportExportsController.downloadReport,
);

reportExportsRouter.post(
  '/:id/revoke',
  validate({ body: revokeExportReportSchema }),
  reportExportsController.revokeExport,
);

reportExportsRouter.get(
  '/:id',
  reportExportsController.getExportDetail,
);

