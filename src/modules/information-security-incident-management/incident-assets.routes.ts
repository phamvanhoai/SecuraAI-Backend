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

// Supporting route for Link Incident to Asset: load linkable assets.
incidentAssetsRouter.get(
  '/:incidentId/assets/options',
  authenticate,
  validate({ params: incidentIdParamsSchema, query: incidentAssetOptionsQuerySchema }),
  asyncHandler(getIncidentAssetOptions),
);

// Use case: Link Incident to Asset -> linkIncidentAsset.
incidentAssetsRouter.post(
  '/:incidentId/assets',
  authenticate,
  validate({ params: incidentIdParamsSchema, body: linkIncidentAssetBodySchema }),
  asyncHandler(linkIncidentAsset),
);

// Supporting action: remove an existing incident-asset link.
incidentAssetsRouter.delete(
  '/:incidentId/assets/:assetId',
  authenticate,
  validate({ params: incidentAssetParamsSchema }),
  asyncHandler(unlinkIncidentAsset),
);
