import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  incidentRiskLinkParamsSchema,
  incidentRiskOptionsQuerySchema,
  incidentRiskParamsSchema,
  linkIncidentRiskBodySchema,
} from './dto/link-incident-risk.dto.js';
import { incidentRisksService } from './incident-risks.service.js';
function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
export const getIncidentRiskOptions: RequestHandler = async (req, res) => {
  const { incidentId } = incidentRiskParamsSchema.parse(req.params);
  const data = await incidentRisksService.options(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    incidentRiskOptionsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};
export const unlinkIncidentRisk: RequestHandler = async (req, res) => {
  const { incidentId, riskId } = incidentRiskLinkParamsSchema.parse(req.params);
  await incidentRisksService.unlink(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    riskId,
  );
  res.status(204).send();
};
export const linkIncidentRisk: RequestHandler = async (req, res) => {
  const { incidentId } = incidentRiskParamsSchema.parse(req.params);
  const data = await incidentRisksService.link(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    linkIncidentRiskBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
