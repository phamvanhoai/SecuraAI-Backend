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
  submitRiskTreatmentPlan,
  approveRiskTreatmentPlan,
  returnRiskTreatmentPlanForRevision,
  listRiskTreatmentPlans,
  getRiskTreatmentPlanDetail,
  listRiskTreatmentPlanCreateOptions,
  createRiskTreatmentPlan,
  updateRiskTreatmentPlan,
  cancelRiskTreatmentPlan,
} from './risk-management.controller.js';
import { listRiskAssessmentsQuerySchema } from './dto/list-risk-assessments-query.dto.js';
import { riskAssessmentParamsSchema } from './dto/risk-assessment-params.dto.js';
import { createRiskAssessmentBodySchema } from './dto/create-risk-assessment.dto.js';
import { updateRiskAssessmentBodySchema } from './dto/update-risk-assessment.dto.js';
import { cancelRiskAssessmentBodySchema } from './dto/cancel-risk-assessment.dto.js';
import { riskCreateOptionsQuerySchema } from './dto/risk-create-options-query.dto.js';
import {
  submitTreatmentPlanBodySchema,
  treatmentPlanParamsSchema,
} from './dto/submit-treatment-plan.dto.js';
import {
  approveTreatmentPlanBodySchema,
  approveTreatmentPlanParamsSchema,
} from './dto/approve-treatment-plan.dto.js';
import {
  returnTreatmentPlanForRevisionBodySchema,
  returnTreatmentPlanForRevisionParamsSchema,
} from './dto/return-treatment-plan-for-revision.dto.js';
import { listTreatmentPlansQuerySchema } from './dto/list-treatment-plans-query.dto.js';
import {
  createTreatmentPlanBodySchema,
  treatmentPlanCreateOptionsQuerySchema,
} from './dto/create-treatment-plan.dto.js';
import { updateTreatmentPlanBodySchema } from './dto/update-treatment-plan.dto.js';
import { cancelTreatmentPlanBodySchema } from './dto/cancel-treatment-plan.dto.js';

export const riskManagementRouter = Router();

riskManagementRouter.get(
  '/treatment-plans',
  authenticate,
  authorize('risk-treatment-plans.read'),
  validate({ query: listTreatmentPlansQuerySchema }),
  asyncHandler(listRiskTreatmentPlans),
);

riskManagementRouter.get(
  '/treatment-plans/create-options',
  authenticate,
  authorize('risk-treatment-plans.create'),
  validate({ query: treatmentPlanCreateOptionsQuerySchema }),
  asyncHandler(listRiskTreatmentPlanCreateOptions),
);

riskManagementRouter.post(
  '/treatment-plans',
  authenticate,
  authorize('risk-treatment-plans.create'),
  validate({ body: createTreatmentPlanBodySchema }),
  asyncHandler(createRiskTreatmentPlan),
);

riskManagementRouter.get(
  '/treatment-plans/:treatmentPlanId',
  authenticate,
  authorize('risk-treatment-plans.read'),
  validate({ params: treatmentPlanParamsSchema }),
  asyncHandler(getRiskTreatmentPlanDetail),
);

riskManagementRouter.patch(
  '/treatment-plans/:treatmentPlanId',
  authenticate,
  authorize('risk-treatment-plans.update'),
  validate({ params: treatmentPlanParamsSchema, body: updateTreatmentPlanBodySchema }),
  asyncHandler(updateRiskTreatmentPlan),
);

riskManagementRouter.post(
  '/treatment-plans/:treatmentPlanId/cancel',
  authenticate,
  authorize('risk-treatment-plans.cancel'),
  validate({ params: treatmentPlanParamsSchema, body: cancelTreatmentPlanBodySchema }),
  asyncHandler(cancelRiskTreatmentPlan),
);

riskManagementRouter.post(
  '/treatment-plans/:treatmentPlanId/approve',
  authenticate,
  authorize('risk-treatment-plans.approve'),
  validate({ params: approveTreatmentPlanParamsSchema, body: approveTreatmentPlanBodySchema }),
  asyncHandler(approveRiskTreatmentPlan),
);

riskManagementRouter.post(
  '/treatment-plans/:treatmentPlanId/return-for-revision',
  authenticate,
  authorize('risk-treatment-plans.approve'),
  validate({
    params: returnTreatmentPlanForRevisionParamsSchema,
    body: returnTreatmentPlanForRevisionBodySchema,
  }),
  asyncHandler(returnRiskTreatmentPlanForRevision),
);

riskManagementRouter.post(
  '/treatment-plans/:treatmentPlanId/submit',
  authenticate,
  authorize('risk-treatment-plans.submit'),
  validate({ params: treatmentPlanParamsSchema, body: submitTreatmentPlanBodySchema }),
  asyncHandler(submitRiskTreatmentPlan),
);

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
