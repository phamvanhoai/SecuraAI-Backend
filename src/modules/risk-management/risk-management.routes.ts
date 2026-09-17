import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createRiskAssessment,
  getRiskAssessmentDetail,
  listRiskAssessmentCreateOptions,
  listRiskAssessments,
  updateRiskAssessment,
  cancelRiskAssessment,
} from './risk-management.controller.js';
import { listRiskAssessmentsQuerySchema } from './dto/list-risk-assessments-query.dto.js';
import { riskAssessmentParamsSchema } from './dto/risk-assessment-params.dto.js';
import { createRiskAssessmentBodySchema } from './dto/create-risk-assessment.dto.js';
import { updateRiskAssessmentBodySchema } from './dto/update-risk-assessment.dto.js';
import { cancelRiskAssessmentBodySchema } from './dto/cancel-risk-assessment.dto.js';
import { riskCreateOptionsQuerySchema } from './dto/risk-create-options-query.dto.js';

export const riskManagementRouter = Router();

riskManagementRouter.get(
  '/',
  authenticate,
  authorize('risks.read'),
  validate({ query: listRiskAssessmentsQuerySchema }),
  asyncHandler(listRiskAssessments),
);
riskManagementRouter.patch(
  '/:riskAssessmentId',
  authenticate,
  authorize('risks.update'),
  validate({ params: riskAssessmentParamsSchema, body: updateRiskAssessmentBodySchema }),
  asyncHandler(updateRiskAssessment),
);
riskManagementRouter.post(
  '/:riskAssessmentId/cancel',
  authenticate,
  authorize('risks.cancel'),
  validate({ params: riskAssessmentParamsSchema, body: cancelRiskAssessmentBodySchema }),
  asyncHandler(cancelRiskAssessment),
);
riskManagementRouter.get(
  '/create-options',
  authenticate,
  validate({ query: riskCreateOptionsQuerySchema }),
  asyncHandler(listRiskAssessmentCreateOptions),
);
riskManagementRouter.post(
  '/',
  authenticate,
  authorize('risks.create'),
  validate({ body: createRiskAssessmentBodySchema }),
  asyncHandler(createRiskAssessment),
);
riskManagementRouter.get(
  '/:riskAssessmentId',
  authenticate,
  authorize('risks.read'),
  validate({ params: riskAssessmentParamsSchema }),
  asyncHandler(getRiskAssessmentDetail),
);
