import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  incidentAssetParamsSchema,
  incidentAssetOptionsQuerySchema,
  incidentIdParamsSchema,
  linkIncidentAssetBodySchema,
} from './dto/link-incident-asset.dto.js';
import { incidentAssetsService } from './incident-assets.service.js';

function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}

export const getIncidentAssetOptions: RequestHandler = async (req, res) => {
  const { incidentId } = incidentIdParamsSchema.parse(req.params);
  const data = await incidentAssetsService.options(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    incidentAssetOptionsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const linkIncidentAsset: RequestHandler = async (req, res) => {
  const { incidentId } = incidentIdParamsSchema.parse(req.params);
  const data = await incidentAssetsService.link(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    linkIncidentAssetBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};

export const unlinkIncidentAsset: RequestHandler = async (req, res) => {
  const { incidentId, assetId } = incidentAssetParamsSchema.parse(req.params);
  await incidentAssetsService.unlink(
    authenticatedUserId(res.locals.authenticatedUserId),
    incidentId,
    assetId,
  );
  res.status(204).send();
};
