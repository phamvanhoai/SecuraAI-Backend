import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { listRiskAssessmentsQuerySchema } from './dto/list-risk-assessments-query.dto.js';
import { riskManagementService } from './risk-management.service.js';
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
import {
  treatmentActionProgressParamsSchema,
  updateTreatmentActionProgressBodySchema,
} from './dto/update-treatment-action-progress.dto.js';
import {
  performResidualRiskAssessmentBodySchema,
  residualRiskAssessmentParamsSchema,
} from './dto/perform-residual-risk-assessment.dto.js';

export const performResidualRiskAssessment: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { riskAssessmentId } = residualRiskAssessmentParamsSchema.parse(req.params);
  const data = await riskManagementService.performResidualRiskAssessment(
    riskAssessmentId,
    performResidualRiskAssessmentBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(200).json({ success: true, data });
};

export const updateRiskTreatmentActionProgress: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { treatmentPlanId, actionId } = treatmentActionProgressParamsSchema.parse(req.params);
  const data = await riskManagementService.updateTreatmentActionProgress(
    treatmentPlanId,
    actionId,
    updateTreatmentActionProgressBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(200).json({ success: true, data });
};

export const cancelRiskTreatmentPlan: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { treatmentPlanId } = treatmentPlanParamsSchema.parse(req.params);
  const data = await riskManagementService.cancelTreatmentPlan(
    treatmentPlanId,
    cancelTreatmentPlanBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(200).json({ success: true, data });
};

export const updateRiskTreatmentPlan: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { treatmentPlanId } = treatmentPlanParamsSchema.parse(req.params);
  const data = await riskManagementService.updateTreatmentPlan(
    treatmentPlanId,
    updateTreatmentPlanBodySchema.parse(req.body),
    req.auth,
    { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null },
  );
  res.status(200).json({ success: true, data });
};

export const listRiskTreatmentPlanCreateOptions: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await riskManagementService.listTreatmentPlanCreateOptions(
    treatmentPlanCreateOptionsQuerySchema.parse(req.query),
    req.auth,
  );
  res.status(200).json({ success: true, data });
};

export const createRiskTreatmentPlan: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const input = createTreatmentPlanBodySchema.parse(req.body);
  const data = await riskManagementService.createTreatmentPlan(input, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(201).json({ success: true, data });
};

export const listRiskTreatmentPlans: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await riskManagementService.listTreatmentPlans(
    listTreatmentPlansQuerySchema.parse(req.query),
    req.auth,
  );
  res.status(200).json({ success: true, data });
};

export const getRiskTreatmentPlanDetail: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { treatmentPlanId } = treatmentPlanParamsSchema.parse(req.params);
  const data = await riskManagementService.getTreatmentPlanById(treatmentPlanId, req.auth);
  res.status(200).json({ success: true, data });
};

export const approveRiskTreatmentPlan: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { treatmentPlanId } = approveTreatmentPlanParamsSchema.parse(req.params);
  const input = approveTreatmentPlanBodySchema.parse(req.body);
  const data = await riskManagementService.approveTreatmentPlan(treatmentPlanId, input, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const returnRiskTreatmentPlanForRevision: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { treatmentPlanId } = returnTreatmentPlanForRevisionParamsSchema.parse(req.params);
  const input = returnTreatmentPlanForRevisionBodySchema.parse(req.body);
  const data = await riskManagementService.returnTreatmentPlanForRevision(
    treatmentPlanId,
    input,
    req.auth,
    {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
    },
  );
  res.status(200).json({ success: true, data });
};

export const submitRiskTreatmentPlan: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { treatmentPlanId } = treatmentPlanParamsSchema.parse(req.params);
  const input = submitTreatmentPlanBodySchema.parse(req.body);
  const data = await riskManagementService.submitTreatmentPlan(treatmentPlanId, input, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const listRiskAssessments: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await riskManagementService.list(
    listRiskAssessmentsQuerySchema.parse(req.query),
    req.auth,
  );
  res.status(200).json({ success: true, data });
};

export const getRiskAssessmentDetail: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { riskAssessmentId } = riskAssessmentParamsSchema.parse(req.params);
  const data = await riskManagementService.getById(riskAssessmentId, req.auth);
  res.status(200).json({ success: true, data });
};

export const listRiskAssessmentCreateOptions: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.status(200).json({
    success: true,
    data: await riskManagementService.listCreateOptions(
      riskCreateOptionsQuerySchema.parse(req.query),
      req.auth,
    ),
  });
};

export const createRiskAssessment: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const input = createRiskAssessmentBodySchema.parse(req.body);
  const data = await riskManagementService.create(input, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(201).json({ success: true, data });
};

export const updateRiskAssessment: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { riskAssessmentId } = riskAssessmentParamsSchema.parse(req.params);
  const input = updateRiskAssessmentBodySchema.parse(req.body);
  const data = await riskManagementService.update(riskAssessmentId, input, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const cancelRiskAssessment: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { riskAssessmentId } = riskAssessmentParamsSchema.parse(req.params);
  const input = cancelRiskAssessmentBodySchema.parse(req.body);
  const data = await riskManagementService.cancel(riskAssessmentId, input, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const riskManagementController = {
  listRiskTreatmentPlans,
  listRiskTreatmentPlanCreateOptions,
  createRiskTreatmentPlan,
  getRiskTreatmentPlanDetail,
  listRiskAssessments,
  getRiskAssessmentDetail,
  listRiskAssessmentCreateOptions,
  createRiskAssessment,
  updateRiskAssessment,
  cancelRiskAssessment,
  submitRiskTreatmentPlan,
  approveRiskTreatmentPlan,
} as const;
