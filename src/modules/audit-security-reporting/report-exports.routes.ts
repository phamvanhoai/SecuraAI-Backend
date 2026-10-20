import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizeRoles } from '../../common/middleware/authorize-roles.js';
import { validate } from '../../common/middleware/validate.js';
import {
  exportReportRequestSchema,
  listExportReportsQuerySchema,
  revokeExportReportSchema,
} from './dto/export-security-reports.dto.js';
import { reportExportsController } from './report-exports.controller.js';

export const reportExportsRouter = Router();

reportExportsRouter.use(
  authenticate,
  authorizeRoles('SECURITY_OFFICER', 'EXECUTIVE'),
);

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

