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
import {
  createTreatmentPlanBodySchema,
  treatmentPlanOptionsQuerySchema,
} from './dto/create-treatment-plan.dto.js';
import {
  updateTreatmentPlanBodySchema,
  updateTreatmentPlanParamsSchema,
} from './dto/update-treatment-plan.dto.js';
import {
  decideRiskAcceptanceBodySchema,
  decideRiskAcceptanceParamsSchema,
  submitRiskAcceptanceBodySchema,
  submitRiskAcceptanceParamsSchema,
  openRiskReviewBodySchema,
} from './dto/risk-acceptance.dto.js';

// These paths are relative to the Risk module mount path.
// authenticate checks the session; validate checks params, query and body with Zod.
// asyncHandler forwards rejected promises to the shared error handler.
// The service and repository enforce roles, ownership and allowed workflow states.
export const riskRegisterRouter = Router();
riskRegisterRouter.post(
  // Complete an open Risk review after authentication and input validation.
  '/:riskId/review/complete',
  authenticate,
  validate({ params: riskIdParamsSchema, body: completeRiskReviewSchema }),
  asyncHandler(completeRiskReview),
);
// View the Risk Register using validated search, filters and pagination.
riskRegisterRouter.get(
  '/',
  authenticate,
  validate({ query: listRiskRegisterQuerySchema }),
  asyncHandler(listRiskRegister),
);
// Create a Risk assessment; the service requires an active Security Officer.
riskRegisterRouter.post(
  '/',
  authenticate,
  validate({ body: createRiskAssessmentBodySchema }),
  asyncHandler(createRiskAssessment),
);
// Edit an existing Vulnerability and its related Control links.
riskRegisterRouter.patch(
  '/:riskId/vulnerabilities/:vulnerabilityId',
  authenticate,
  validate({ params: updateVulnerabilityParamsSchema, body: updateVulnerabilityBodySchema }),
  asyncHandler(updateVulnerability),
);
// Search eligible Controls for the Vulnerability form.
riskRegisterRouter.get(
  '/:riskId/vulnerability-control-options',
  authenticate,
  validate({
    params: identifyVulnerabilityParamsSchema,
    query: vulnerabilityControlOptionsQuerySchema,
  }),
  asyncHandler(getVulnerabilityControlOptions),
);
// Load scope and Owner choices for the Create Risk form.
riskRegisterRouter.get(
  '/create-options',
  authenticate,
  validate({ query: createRiskOptionsQuerySchema }),
  asyncHandler(getCreateRiskOptions),
);
// Search responsible users and related Controls for a treatment plan.
riskRegisterRouter.get(
  '/treatment-plans/create-options',
  authenticate,
  validate({ query: treatmentPlanOptionsQuerySchema }),
  asyncHandler(getTreatmentPlanOptions),
);
// Create a treatment plan after checking the Risk and current Residual basis.
riskRegisterRouter.post(
  '/treatment-plans',
  authenticate,
  validate({ body: createTreatmentPlanBodySchema }),
  asyncHandler(createTreatmentPlan),
);
// Update a treatment plan with state, ownership and stale-version checks.
riskRegisterRouter.patch(
  '/treatment-plans/:treatmentPlanId',
  authenticate,
  validate({ params: updateTreatmentPlanParamsSchema, body: updateTreatmentPlanBodySchema }),
  asyncHandler(updateTreatmentPlan),
);
riskRegisterRouter.patch(
  // Approve or reject a pending request; workflow permissions are checked in the service/repository.
  '/acceptances/:acceptanceId/decision',
  authenticate,
  validate({ params: decideRiskAcceptanceParamsSchema, body: decideRiskAcceptanceBodySchema }),
  asyncHandler(decideRiskAcceptance),
);
// Let other routers handle remaining treatment-plan paths instead of treating them as Risk IDs.
riskRegisterRouter.use(['/treatment-plans'], (_req, _res, next) => next('router'));
// Identify a Threat and link it to Vulnerabilities of this Risk.
riskRegisterRouter.post(
  '/:riskId/threats',
  authenticate,
  validate({ params: identifyThreatParamsSchema, body: identifyThreatBodySchema }),
  asyncHandler(identifyThreat),
);
// Edit an existing Threat and its Vulnerability links.
riskRegisterRouter.patch(
  '/:riskId/threats/:threatId',
  authenticate,
  validate({ params: updateThreatParamsSchema, body: updateThreatBodySchema }),
  asyncHandler(updateThreat),
);
// Identify a Vulnerability and link related Controls.
riskRegisterRouter.post(
  '/:riskId/vulnerabilities',
  authenticate,
  validate({
    params: identifyVulnerabilityParamsSchema,
    body: identifyVulnerabilityBodySchema,
  }),
  asyncHandler(identifyVulnerability),
);
// Record inherent risk before considering existing Controls.
riskRegisterRouter.post(
  '/:riskId/inherent-assessments',
  authenticate,
  validate({ params: assessInherentRiskParamsSchema, body: assessInherentRiskBodySchema }),
  asyncHandler(assessInherentRisk),
);
// Record remaining risk after checking current Inherent and Control assessments.
riskRegisterRouter.post(
  '/:riskId/residual-assessments',
  authenticate,
  validate({ params: assessResidualRiskParamsSchema, body: assessResidualRiskBodySchema }),
  asyncHandler(assessResidualRisk),
);
// Define the target risk for a selected treatment plan.
riskRegisterRouter.post(
  '/:riskId/target-risk',
  authenticate,
  validate({ params: defineTargetRiskParamsSchema, body: defineTargetRiskBodySchema }),
  asyncHandler(defineTargetRisk),
);
riskRegisterRouter.post(
  // Submit acceptance; only the assigned Risk Owner may perform the operation.
  '/:riskId/acceptance',
  authenticate,
  validate({ params: submitRiskAcceptanceParamsSchema, body: submitRiskAcceptanceBodySchema }),
  asyncHandler(submitRiskAcceptance),
);
// Review never rewrites the original approval or its expiry date.
riskRegisterRouter.post(
  // Open a Risk review while preserving previous decisions.
  '/:riskId/review',
  authenticate,
  validate({ params: submitRiskAcceptanceParamsSchema, body: openRiskReviewBodySchema }),
  asyncHandler(openRiskAcceptanceReview),
);
// View the selected Risk detail within the authenticated user access scope.
riskRegisterRouter.get(
  '/:riskId',
  authenticate,
  validate({ params: riskIdParamsSchema }),
  asyncHandler(getRiskRecord),
);
