import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  frameworkControlsQuerySchema,
  frameworkParamsSchema,
  listPolicyControlMappingsQuerySchema,
  policyFrameworkMappingParamsSchema,
  replacePolicyControlMappingsBodySchema,
} from './dto/map-controls.dto.js';
import { policyControlMappingService } from './policy-control-mapping.service.js';

const requireActor = (auth: Express.Request['auth']) => {
  if (!auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return auth;
};

export const listPolicyControlMappings: RequestHandler = async (req, res) => {
  const data = await policyControlMappingService.list(
    listPolicyControlMappingsQuerySchema.parse(req.query),
    requireActor(req.auth),
  );
  res.status(200).json({ success: true, data });
};

export const listComplianceFrameworks: RequestHandler = async (req, res) => {
  const data = await policyControlMappingService.listFrameworks(requireActor(req.auth));
  res.status(200).json({ success: true, data });
};

export const listComplianceFrameworkControls: RequestHandler = async (req, res) => {
  const { frameworkId } = frameworkParamsSchema.parse(req.params);
  const data = await policyControlMappingService.listFrameworkControls(
    frameworkId,
    frameworkControlsQuerySchema.parse(req.query),
    requireActor(req.auth),
  );
  res.status(200).json({ success: true, data });
};

export const replacePolicyControlMappings: RequestHandler = async (req, res) => {
  const { policyId, versionId, frameworkId } = policyFrameworkMappingParamsSchema.parse(req.params);
  const data = await policyControlMappingService.replace(
    policyId,
    versionId,
    frameworkId,
    replacePolicyControlMappingsBodySchema.parse(req.body),
    requireActor(req.auth),
    {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
    },
  );
  res.status(200).json({ success: true, data });
};
