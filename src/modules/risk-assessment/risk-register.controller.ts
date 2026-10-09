import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { listRiskRegisterQuerySchema, riskIdParamsSchema } from './dto/view-risk-register.dto.js';
import { riskRegisterService } from './risk-register.service.js';
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

function userId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
export const listRiskRegister: RequestHandler = async (req, res) => {
  const data = await riskRegisterService.list(
    userId(res.locals.authenticatedUserId),
    listRiskRegisterQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};
export const getRiskRecord: RequestHandler = async (req, res) => {
  const { riskId } = riskIdParamsSchema.parse(req.params);
  const data = await riskRegisterService.get(userId(res.locals.authenticatedUserId), riskId);
  res.status(200).json({ success: true, data });
};
export const getCreateRiskOptions: RequestHandler = async (req, res) => {
  const data = await riskRegisterService.createOptions(
    userId(res.locals.authenticatedUserId),
    createRiskOptionsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};
export const createRiskAssessment: RequestHandler = async (req, res) => {
  const data = await riskRegisterService.create(
    userId(res.locals.authenticatedUserId),
    createRiskAssessmentBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const identifyThreat: RequestHandler = async (req, res) => {
  const { riskId } = identifyThreatParamsSchema.parse(req.params);
  const data = await riskRegisterService.identifyThreat(
    userId(res.locals.authenticatedUserId),
    riskId,
    identifyThreatBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const identifyVulnerability: RequestHandler = async (req, res) => {
  const { riskId } = identifyVulnerabilityParamsSchema.parse(req.params);
  const data = await riskRegisterService.identifyVulnerability(
    userId(res.locals.authenticatedUserId),
    riskId,
    identifyVulnerabilityBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const assessInherentRisk: RequestHandler = async (req, res) => {
  const { riskId } = assessInherentRiskParamsSchema.parse(req.params);
  const data = await riskRegisterService.assessInherentRisk(
    userId(res.locals.authenticatedUserId),
    riskId,
    assessInherentRiskBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const assessResidualRisk: RequestHandler = async (req, res) => {
  const { riskId } = assessResidualRiskParamsSchema.parse(req.params);
  const data = await riskRegisterService.assessResidualRisk(
    userId(res.locals.authenticatedUserId),
    riskId,
    assessResidualRiskBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const defineTargetRisk: RequestHandler = async (req, res) => {
  const { riskId } = defineTargetRiskParamsSchema.parse(req.params);
  const data = await riskRegisterService.defineTargetRisk(
    userId(res.locals.authenticatedUserId),
    riskId,
    defineTargetRiskBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const getTreatmentPlanOptions: RequestHandler = async (req, res) => {
  const data = await riskRegisterService.treatmentPlanOptions(userId(res.locals.authenticatedUserId), treatmentPlanOptionsQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
};
export const createTreatmentPlan: RequestHandler = async (req, res) => {
  const data = await riskRegisterService.createTreatmentPlan(userId(res.locals.authenticatedUserId), createTreatmentPlanBodySchema.parse(req.body));
  res.status(201).json({ success: true, data });
};
export const updateTreatmentPlan: RequestHandler = async (req, res) => {
  const { treatmentPlanId } = updateTreatmentPlanParamsSchema.parse(req.params);
  const data = await riskRegisterService.updateTreatmentPlan(userId(res.locals.authenticatedUserId), treatmentPlanId, updateTreatmentPlanBodySchema.parse(req.body));
  res.status(200).json({ success: true, data });
};
export const submitRiskAcceptance: RequestHandler = async (req, res) => { const { riskId } = submitRiskAcceptanceParamsSchema.parse(req.params); const data = await riskRegisterService.submitAcceptance(userId(res.locals.authenticatedUserId), riskId, submitRiskAcceptanceBodySchema.parse(req.body)); res.status(201).json({ success: true, data }); };
export const decideRiskAcceptance: RequestHandler = async (req, res) => { const { acceptanceId } = decideRiskAcceptanceParamsSchema.parse(req.params); const data = await riskRegisterService.decideAcceptance(userId(res.locals.authenticatedUserId), acceptanceId, decideRiskAcceptanceBodySchema.parse(req.body)); res.status(200).json({ success: true, data }); };
