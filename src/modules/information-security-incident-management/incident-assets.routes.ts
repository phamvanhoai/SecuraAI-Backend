import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getIncidentAssetOptions,
  linkIncidentAsset,
  unlinkIncidentAsset,
} from './incident-assets.controller.js';
import {
  incidentAssetParamsSchema,
  incidentAssetOptionsQuerySchema,
  incidentIdParamsSchema,
  linkIncidentAssetBodySchema,
} from './dto/link-incident-asset.dto.js';

export const incidentAssetsRouter = Router();

incidentAssetsRouter.get(
  '/:incidentId/assets/options',
  authenticate,
  validate({ params: incidentIdParamsSchema, query: incidentAssetOptionsQuerySchema }),
  asyncHandler(getIncidentAssetOptions),
);

incidentAssetsRouter.post(
  '/:incidentId/assets',
  authenticate,
  validate({ params: incidentIdParamsSchema, body: linkIncidentAssetBodySchema }),
  asyncHandler(linkIncidentAsset),
);

incidentAssetsRouter.delete(
  '/:incidentId/assets/:assetId',
  authenticate,
  validate({ params: incidentAssetParamsSchema }),
  asyncHandler(unlinkIncidentAsset),
);
