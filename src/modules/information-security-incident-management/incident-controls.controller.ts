import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  incidentControlLinkParamsSchema,
  incidentControlOptionsQuerySchema,
  incidentControlParamsSchema,
  linkIncidentControlBodySchema,
} from './dto/link-incident-control.dto.js';
import { incidentControlsService } from './incident-controls.service.js';

function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}

export const getIncidentControlOptions: RequestHandler = async (req, res) => {
  const { incidentId } = incidentControlParamsSchema.parse(req.params);
  const data = await incidentControlsService.options(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    incidentControlOptionsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const unlinkIncidentControl: RequestHandler = async (req, res) => {
  const { incidentId, controlId } = incidentControlLinkParamsSchema.parse(req.params);
  await incidentControlsService.unlink(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    controlId,
  );
  res.status(204).send();
};

export const linkIncidentControl: RequestHandler = async (req, res) => {
  const { incidentId } = incidentControlParamsSchema.parse(req.params);
  const data = await incidentControlsService.link(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    linkIncidentControlBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
