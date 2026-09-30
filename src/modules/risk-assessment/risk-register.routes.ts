import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createRiskAssessment,
  getCreateRiskOptions,
  getRiskRecord,
  identifyThreat,
  identifyVulnerability,
  assessInherentRisk,
  assessResidualRisk,
  defineTargetRisk,
  listRiskRegister,
  createTreatmentPlan,
  getTreatmentPlanOptions,
  updateTreatmentPlan,
  submitRiskAcceptance,
  decideRiskAcceptance,
} from './risk-register.controller.js';
import { listRiskRegisterQuerySchema, riskIdParamsSchema } from './dto/view-risk-register.dto.js';
import {
  createRiskAssessmentBodySchema,
  createRiskOptionsQuerySchema,
} from './dto/create-risk-assessment.dto.js';
import { identifyThreatBodySchema, identifyThreatParamsSchema } from './dto/identify-threat.dto.js';
import {
  identifyVulnerabilityBodySchema,
  identifyVulnerabilityParamsSchema,
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
import { decideRiskAcceptanceBodySchema, decideRiskAcceptanceParamsSchema, submitRiskAcceptanceBodySchema, submitRiskAcceptanceParamsSchema } from './dto/risk-acceptance.dto.js';

export const riskRegisterRouter = Router();
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
riskRegisterRouter.get(
  '/:riskId',
  authenticate,
  validate({ params: riskIdParamsSchema }),
  asyncHandler(getRiskRecord),
);
