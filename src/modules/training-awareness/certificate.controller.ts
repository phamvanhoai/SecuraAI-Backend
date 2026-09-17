import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { assessmentParamsSchema } from './dto/assessment.dto.js';
import { certificateService } from './certificate.service.js';

export const getCertificate: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { enrollmentId } = assessmentParamsSchema.parse(req.params);
  res.json({ success: true, data: await certificateService.get(enrollmentId, req.auth) });
};
export const issueCertificate: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { enrollmentId } = assessmentParamsSchema.parse(req.params);
  const data = await certificateService.issue(enrollmentId, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};
