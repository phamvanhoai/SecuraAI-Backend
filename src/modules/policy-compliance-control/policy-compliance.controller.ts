import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { listPolicyDraftsQuerySchema } from './dto/list-policy-drafts.dto.js';
import { policyComplianceService } from './policy-compliance.service.js';

export const listOwnPolicyDrafts: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await policyComplianceService.listOwnDrafts(
    userId,
    listPolicyDraftsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};
