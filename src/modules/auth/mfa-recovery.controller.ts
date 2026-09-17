import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  createMfaRecoveryRequestBodySchema,
  decideMfaRecoveryRequestBodySchema,
  listMfaRecoveryRequestsQuerySchema,
  mfaRecoveryRequestParamsSchema,
} from './dto/mfa-recovery.dto.js';
import { mfaRecoveryService } from './mfa-recovery.service.js';

export const createMfaRecoveryRequest: RequestHandler = async (req, res) => {
  const data = await mfaRecoveryService.create(createMfaRecoveryRequestBodySchema.parse(req.body));
  res.status(202).json({ success: true, data });
};

export const listMfaRecoveryRequests: RequestHandler = async (req, res) => {
  const data = await mfaRecoveryService.list(listMfaRecoveryRequestsQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
};

const decide = (decision: 'approved' | 'rejected'): RequestHandler => async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { requestId } = mfaRecoveryRequestParamsSchema.parse(req.params);
  const data = await mfaRecoveryService.decide(
    requestId,
    req.auth.userId,
    decision,
    decideMfaRecoveryRequestBodySchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

export const approveMfaRecoveryRequest = decide('approved');
export const rejectMfaRecoveryRequest = decide('rejected');
