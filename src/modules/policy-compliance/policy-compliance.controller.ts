import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { AppError } from '../../common/errors/app-error.js';
import type { CreatePolicyDraftInput } from './dto/create-policy-draft.dto.js';
import type { PolicyDraftResponse } from './policy-compliance.mapper.js';
import {
  publishPolicyVersionBodySchema,
  publishPolicyVersionParamsSchema,
} from './dto/publish-policy-version.dto.js';
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

export const publishPolicyVersion: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { policyId, versionId } = publishPolicyVersionParamsSchema.parse(req.params);
  const body = publishPolicyVersionBodySchema.parse(req.body);
  const data = await policyComplianceService.publishVersion(policyId, versionId, body, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const policyComplianceController = { createPolicyDraft, publishPolicyVersion } as const;
