import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { listRiskAssessmentsQuerySchema } from './dto/list-risk-assessments-query.dto.js';
import { riskManagementService } from './risk-management.service.js';
import { riskAssessmentParamsSchema } from './dto/risk-assessment-params.dto.js';
import { createRiskAssessmentBodySchema } from './dto/create-risk-assessment.dto.js';
import { updateRiskAssessmentBodySchema } from './dto/update-risk-assessment.dto.js';
import { cancelRiskAssessmentBodySchema } from './dto/cancel-risk-assessment.dto.js';
import { riskCreateOptionsQuerySchema } from './dto/risk-create-options-query.dto.js';

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
  listRiskAssessments,
  getRiskAssessmentDetail,
  listRiskAssessmentCreateOptions,
  createRiskAssessment,
  updateRiskAssessment,
  cancelRiskAssessment,
} as const;
