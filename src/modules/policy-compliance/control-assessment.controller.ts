import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { controlAssessmentParamsSchema, createControlAssessmentBodySchema, listControlAssessmentsQuerySchema } from './dto/control-assessment.dto.js';
import { controlAssessmentService } from './control-assessment.service.js';

const auth = (req: Parameters<RequestHandler>[0]) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth;
};
export const listControlAssessments: RequestHandler = async (req, res) => res.status(200).json({ success: true, data: await controlAssessmentService.list(listControlAssessmentsQuerySchema.parse(req.query), auth(req)) });
export const getControlAssessmentHistory: RequestHandler = async (req, res) => {
  const { controlId } = controlAssessmentParamsSchema.parse(req.params);
  res.status(200).json({ success: true, data: await controlAssessmentService.history(controlId, auth(req)) });
};
export const createControlAssessment: RequestHandler = async (req, res) => {
  const { controlId } = controlAssessmentParamsSchema.parse(req.params);
  const data = await controlAssessmentService.create(controlId, createControlAssessmentBodySchema.parse(req.body), auth(req), { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 1000) ?? null });
  res.status(201).json({ success: true, data });
};
