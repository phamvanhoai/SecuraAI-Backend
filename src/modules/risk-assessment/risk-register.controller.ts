import type { RequestHandler } from 'express';
import { completeRiskReviewSchema } from './dto/complete-risk-review.dto.js';
import { AppError } from '../../common/errors/app-error.js';
import { listRiskRegisterQuerySchema, riskIdParamsSchema } from './dto/view-risk-register.dto.js';
import { riskRegisterService } from './risk-register.service.js';
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

// Read the user ID supplied by authentication middleware, never from the request body.
function userId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
// View the Risk Register with search, filters and pagination.
export const listRiskRegister: RequestHandler = async (req, res) => {
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.list(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    // Validate the search, filter or option query values.
    listRiskRegisterQuerySchema.parse(req.query),
  );
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
// View one Risk and its related records within the user access scope.
export const getRiskRecord: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId } = riskIdParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.get(userId(res.locals.authenticatedUserId), riskId);
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
// Load Asset, Business Service and Owner choices for Create Risk.
export const getCreateRiskOptions: RequestHandler = async (req, res) => {
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.createOptions(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    // Validate the search, filter or option query values.
    createRiskOptionsQuerySchema.parse(req.query),
  );
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
// Create a Risk using the submitted scope, Owner and review date.
export const createRiskAssessment: RequestHandler = async (req, res) => {
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.create(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    // Validate the submitted form data using its Zod schema.
    createRiskAssessmentBodySchema.parse(req.body),
  );
  // Return HTTP 201 with the newly created record or assessment.
  res.status(201).json({ success: true, data });
};
// Record a Threat and its selected Vulnerability links.
export const identifyThreat: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId } = identifyThreatParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.identifyThreat(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    // Validate the submitted form data using its Zod schema.
    identifyThreatBodySchema.parse(req.body),
  );
  // Return HTTP 201 with the newly created record or assessment.
  res.status(201).json({ success: true, data });
};
// Update the selected Threat and its links.
export const updateThreat: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId, threatId } = updateThreatParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.updateThreat(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    threatId,
    // Validate the submitted form data using its Zod schema.
    updateThreatBodySchema.parse(req.body),
  );
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
// Record a Vulnerability and its selected Control links.
export const identifyVulnerability: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId } = identifyVulnerabilityParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.identifyVulnerability(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    // Validate the submitted form data using its Zod schema.
    identifyVulnerabilityBodySchema.parse(req.body),
  );
  // Return HTTP 201 with the newly created record or assessment.
  res.status(201).json({ success: true, data });
};
// Update the selected Vulnerability and its links.
export const updateVulnerability: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId, vulnerabilityId } = updateVulnerabilityParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.updateVulnerability(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    vulnerabilityId,
    // Validate the submitted form data using its Zod schema.
    updateVulnerabilityBodySchema.parse(req.body),
  );
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
// Search Controls available for the Vulnerability form.
export const getVulnerabilityControlOptions: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId } = identifyVulnerabilityParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.vulnerabilityControlOptions(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    // Validate the search, filter or option query values.
    vulnerabilityControlOptionsQuerySchema.parse(req.query),
  );
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
// Record the assessment before considering existing Controls.
export const assessInherentRisk: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId } = assessInherentRiskParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.assessInherentRisk(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    // Validate the submitted form data using its Zod schema.
    assessInherentRiskBodySchema.parse(req.body),
  );
  // Return HTTP 201 with the newly created record or assessment.
  res.status(201).json({ success: true, data });
};
// Record the remaining risk after considering current Controls.
export const assessResidualRisk: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId } = assessResidualRiskParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.assessResidualRisk(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    // Validate the submitted form data using its Zod schema.
    assessResidualRiskBodySchema.parse(req.body),
  );
  // Return HTTP 201 with the newly created record or assessment.
  res.status(201).json({ success: true, data });
};
// Record the intended target for the selected treatment plan.
export const defineTargetRisk: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId } = defineTargetRiskParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.defineTargetRisk(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    // Validate the submitted form data using its Zod schema.
    defineTargetRiskBodySchema.parse(req.body),
  );
  // Return HTTP 201 with the newly created record or assessment.
  res.status(201).json({ success: true, data });
};
// Load searchable users and Controls for treatment planning.
export const getTreatmentPlanOptions: RequestHandler = async (req, res) => {
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.treatmentPlanOptions(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    // Validate the search, filter or option query values.
    treatmentPlanOptionsQuerySchema.parse(req.query),
  );
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
// Create a treatment plan and its actions.
export const createTreatmentPlan: RequestHandler = async (req, res) => {
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.createTreatmentPlan(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    // Validate the submitted form data using its Zod schema.
    createTreatmentPlanBodySchema.parse(req.body),
  );
  // Return HTTP 201 with the newly created record or assessment.
  res.status(201).json({ success: true, data });
};
// Update an existing plan using the submitted expected version.
export const updateTreatmentPlan: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { treatmentPlanId } = updateTreatmentPlanParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.updateTreatmentPlan(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    treatmentPlanId,
    // Validate the submitted form data using its Zod schema.
    updateTreatmentPlanBodySchema.parse(req.body),
  );
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
// Read the Risk ID and validated body, then submit as the authenticated user.
export const submitRiskAcceptance: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId } = submitRiskAcceptanceParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.submitAcceptance(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    // Validate the submitted form data using its Zod schema.
    submitRiskAcceptanceBodySchema.parse(req.body),
  );
  // Return HTTP 201 with the newly created record or assessment.
  res.status(201).json({ success: true, data });
};
// Pass the acceptance decision to the service; authorization is checked there and in the transaction.
export const decideRiskAcceptance: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { acceptanceId } = decideRiskAcceptanceParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.decideAcceptance(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    acceptanceId,
    // Validate the submitted form data using its Zod schema.
    decideRiskAcceptanceBodySchema.parse(req.body),
  );
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
// Start a review using the current user, reason and expected Risk version.
export const openRiskAcceptanceReview: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId } = submitRiskAcceptanceParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.openAcceptanceReview(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    // Validate the submitted form data using its Zod schema.
    openRiskReviewBodySchema.parse(req.body),
  );
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
// Pass the review conclusion, latest assessment and next review date to the service.
export const completeRiskReview: RequestHandler = async (req, res) => {
  // Validate and read the record IDs from the URL path.
  const { riskId } = submitRiskAcceptanceParamsSchema.parse(req.params);
  // Call the service, which checks permissions and business rules.
  const data = await riskRegisterService.completeReview(
    // Use the authenticated user as the actor for this operation.
    userId(res.locals.authenticatedUserId),
    riskId,
    // Validate the submitted form data using its Zod schema.
    completeRiskReviewSchema.parse(req.body),
  );
  // Return HTTP 200 with the result in the standard success envelope.
  res.status(200).json({ success: true, data });
};
