import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { AppError } from '../../common/errors/app-error.js';
import type { CreatePolicyDraftInput } from './dto/create-policy-draft.dto.js';
import type { PolicyDraftResponse } from './policy-compliance.mapper.js';
import { policyComplianceService } from './policy-compliance.service.js';

type CreatePolicyDraftResponse = { success: true; data: PolicyDraftResponse };

export const createPolicyDraft: RequestHandler<
  ParamsDictionary,
  CreatePolicyDraftResponse,
  CreatePolicyDraftInput
> = async (req, res) => {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const data = await policyComplianceService.createPolicyDraft(req.body, req.auth.userId);
  res.status(201).json({ success: true, data });
};

export const policyComplianceController = { createPolicyDraft } as const;
