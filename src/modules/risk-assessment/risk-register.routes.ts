import { Router } from 'express';
import { completeRiskReview } from './risk-register.controller.js';
import { completeRiskReviewSchema } from './dto/complete-risk-review.dto.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createRiskAssessment,
  getCreateRiskOptions,
  getRiskRecord,
  identifyThreat,
  updateThreat,
  identifyVulnerability,
  updateVulnerability,
  getVulnerabilityControlOptions,
  assessInherentRisk,
  assessResidualRisk,
  defineTargetRisk,
  listRiskRegister,
  createTreatmentPlan,
  getTreatmentPlanOptions,
  updateTreatmentPlan,
  submitRiskAcceptance,
  decideRiskAcceptance,
  openRiskAcceptanceReview,
} from './risk-register.controller.js';
import { listRiskRegisterQuerySchema, riskIdParamsSchema } from './dto/view-risk-register.dto.js';
import {
  createRiskAssessmentBodySchema,
  createRiskOptionsQuerySchema,
} from './dto/create-risk-assessment.dto.js';
import {
  identifyThreatBodySchema,
  identifyThreatParamsSchema,
  updateThreatBodySchema,
  updateThreatParamsSchema,
} from './dto/identify-threat.dto.js';
import {
  identifyVulnerabilityBodySchema,
  identifyVulnerabilityParamsSchema,
  updateVulnerabilityBodySchema,
  updateVulnerabilityParamsSchema,
  vulnerabilityControlOptionsQuerySchema,
} from './dto/identify-vulnerability.dto.js';
import {
  assessInherentRiskBodySchema,
  assessInherentRiskParamsSchema,
} from './dto/assess-inherent-risk.dto.js';
import {
  assessResidualRiskBodySchema,
  assessResidualRiskParamsSchema,
} from './dto/assess-residual-risk.dto.js';
import {
  defineTargetRiskBodySchema,
  defineTargetRiskParamsSchema,
} from './dto/define-target-risk.dto.js';
import { createTreatmentPlanBodySchema, treatmentPlanOptionsQuerySchema } from './dto/create-treatment-plan.dto.js';
import { updateTreatmentPlanBodySchema, updateTreatmentPlanParamsSchema } from './dto/update-treatment-plan.dto.js';
import { decideRiskAcceptanceBodySchema, decideRiskAcceptanceParamsSchema, submitRiskAcceptanceBodySchema, submitRiskAcceptanceParamsSchema, openRiskReviewBodySchema } from './dto/risk-acceptance.dto.js';

export const riskRegisterRouter = Router();
riskRegisterRouter.post('/:riskId/review/complete', authenticate, validate({ params: riskIdParamsSchema, body: completeRiskReviewSchema }), asyncHandler(completeRiskReview));
riskRegisterRouter.get(
  '/',
  authenticate,
  validate({ query: listRiskRegisterQuerySchema }),
  asyncHandler(listRiskRegister),
);
riskRegisterRouter.post(
  '/',
  authenticate,
  validate({ body: createRiskAssessmentBodySchema }),
  asyncHandler(createRiskAssessment),
);
riskRegisterRouter.patch(
  '/:riskId/vulnerabilities/:vulnerabilityId',
  authenticate,
  validate({ params: updateVulnerabilityParamsSchema, body: updateVulnerabilityBodySchema }),
  asyncHandler(updateVulnerability),
);
riskRegisterRouter.get(
  '/:riskId/vulnerability-control-options',
  authenticate,
  validate({ params: identifyVulnerabilityParamsSchema, query: vulnerabilityControlOptionsQuerySchema }),
  asyncHandler(getVulnerabilityControlOptions),
);
riskRegisterRouter.get(
  '/create-options',
  authenticate,
  validate({ query: createRiskOptionsQuerySchema }),
  asyncHandler(getCreateRiskOptions),
);
riskRegisterRouter.get('/treatment-plans/create-options', authenticate, validate({ query: treatmentPlanOptionsQuerySchema }), asyncHandler(getTreatmentPlanOptions));
riskRegisterRouter.post('/treatment-plans', authenticate, validate({ body: createTreatmentPlanBodySchema }), asyncHandler(createTreatmentPlan));
riskRegisterRouter.patch('/treatment-plans/:treatmentPlanId', authenticate, validate({ params: updateTreatmentPlanParamsSchema, body: updateTreatmentPlanBodySchema }), asyncHandler(updateTreatmentPlan));
riskRegisterRouter.patch('/acceptances/:acceptanceId/decision', authenticate, validate({ params: decideRiskAcceptanceParamsSchema, body: decideRiskAcceptanceBodySchema }), asyncHandler(decideRiskAcceptance));
riskRegisterRouter.use(['/treatment-plans'], (_req, _res, next) => next('router'));
riskRegisterRouter.post(
  '/:riskId/threats',
  authenticate,
  validate({ params: identifyThreatParamsSchema, body: identifyThreatBodySchema }),
  asyncHandler(identifyThreat),
);
riskRegisterRouter.patch(
  '/:riskId/threats/:threatId',
  authenticate,
  validate({ params: updateThreatParamsSchema, body: updateThreatBodySchema }),
  asyncHandler(updateThreat),
);
riskRegisterRouter.post(
  '/:riskId/vulnerabilities',
  authenticate,
  validate({
    params: identifyVulnerabilityParamsSchema,
    body: identifyVulnerabilityBodySchema,
  }),
  asyncHandler(identifyVulnerability),
);
riskRegisterRouter.post(
  '/:riskId/inherent-assessments',
  authenticate,
  validate({ params: assessInherentRiskParamsSchema, body: assessInherentRiskBodySchema }),
  asyncHandler(assessInherentRisk),
);
riskRegisterRouter.post(
  '/:riskId/residual-assessments',
  authenticate,
  validate({ params: assessResidualRiskParamsSchema, body: assessResidualRiskBodySchema }),
  asyncHandler(assessResidualRisk),
);
riskRegisterRouter.post(
  '/:riskId/target-risk',
  authenticate,
  validate({ params: defineTargetRiskParamsSchema, body: defineTargetRiskBodySchema }),
  asyncHandler(defineTargetRisk),
);
riskRegisterRouter.post('/:riskId/acceptance', authenticate, validate({ params: submitRiskAcceptanceParamsSchema, body: submitRiskAcceptanceBodySchema }), asyncHandler(submitRiskAcceptance));
// Review never rewrites the original approval or its expiry date.
riskRegisterRouter.post('/:riskId/review', authenticate, validate({ params: submitRiskAcceptanceParamsSchema, body: openRiskReviewBodySchema }), asyncHandler(openRiskAcceptanceReview));
riskRegisterRouter.get(
  '/:riskId',
  authenticate,
  validate({ params: riskIdParamsSchema }),
  asyncHandler(getRiskRecord),
);
