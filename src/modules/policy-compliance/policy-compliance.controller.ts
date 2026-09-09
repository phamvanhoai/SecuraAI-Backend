import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  publishPolicyVersionBodySchema,
  publishPolicyVersionParamsSchema,
} from './dto/publish-policy-version.dto.js';
import { policyComplianceService } from './policy-compliance.service.js';

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

export const policyComplianceController = { publishPolicyVersion } as const;
