import { getAssetDependencyOptions } from './assets.controller.js';
import { assetDependencyOptionsQuerySchema } from './dto/link-asset-context.dto.js';
import { Router } from 'express';
import { getAssetOwnerOptions } from './assets.controller.js';
import { assetOwnerOptionsQuerySchema } from './dto/asset-owner-options.dto.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  archiveAsset,
  assignAssetOwner,
  classifyAsset,
  createAsset,
  getAsset,
  getAssetCreateOptions,
  linkAssetContext,
  listAssets,
  updateAsset,
} from './assets.controller.js';
import { assetIdParamsSchema, listAssetsQuerySchema } from './dto/list-assets.dto.js';
import { createAssetBodySchema } from './dto/create-asset.dto.js';
import { updateAssetBodySchema } from './dto/update-asset.dto.js';
import { assignAssetOwnerBodySchema } from './dto/assign-asset-owner.dto.js';
import { classifyAssetBodySchema } from './dto/classify-asset.dto.js';
import { linkAssetContextBodySchema } from './dto/link-asset-context.dto.js';
import { archiveAssetBodySchema } from './dto/archive-asset.dto.js';
import { getAssetContextHistory, getAssetClassificationHistory } from './assets.controller.js';
import { assetClassificationHistoryQuerySchema } from './dto/classify-asset.dto.js';
import { assetContextHistoryQuerySchema } from './dto/link-asset-context.dto.js';
// Match the HTTP method and path, then run each handler in order.
// authenticate checks login. validate checks the input. asyncHandler passes errors to the shared error handler.
// The service and repository check roles, ownership and asset state.
export const assetsRouter = Router();
// Find dependency choices and mark choices that would create a cycle.
assetsRouter.get('/:assetId/dependency-options', authenticate,
  validate({ params: assetIdParamsSchema, query: assetDependencyOptionsQuerySchema }),
  asyncHandler(getAssetDependencyOptions));

// Search eligible owners by name or email.
assetsRouter.get(
  '/owner-options',
  authenticate,
  validate({ query: assetOwnerOptionsQuerySchema }),
  asyncHandler(getAssetOwnerOptions),
);
// Get reference choices for asset forms. This does not create an asset.
assetsRouter.get('/create-options', authenticate, asyncHandler(getAssetCreateOptions));
// View the asset list with search, filters and pagination.
assetsRouter.get(
  '/',
  authenticate,
  validate({ query: listAssetsQuerySchema }),
  asyncHandler(listAssets),
);
// Edit basic asset details.
assetsRouter.patch(
  '/:assetId',
  authenticate,
  validate({ params: assetIdParamsSchema, body: updateAssetBodySchema }),
  asyncHandler(updateAsset),
);
// Archive the asset after checking the confirmation code and reason. Keep its record and links.
assetsRouter.delete(
  '/:assetId',
  authenticate,
  validate({ params: assetIdParamsSchema, body: archiveAssetBodySchema }),
  asyncHandler(archiveAsset),
);
// Assign, replace or remove the asset owner.
assetsRouter.put(
  '/:assetId/owner',
  authenticate,
  validate({ params: assetIdParamsSchema, body: assignAssetOwnerBodySchema }),
  asyncHandler(assignAssetOwner),
);
// Save criticality and data classification in one action.
assetsRouter.post(
  '/:assetId/classify-criticality',
  authenticate,
  validate({ params: assetIdParamsSchema, body: classifyAssetBodySchema }),
  asyncHandler(classifyAsset),
);
// Save the business service, dependencies and event source links.
assetsRouter.put(
  '/:assetId/context',
  authenticate,
  validate({ params: assetIdParamsSchema, body: linkAssetContextBodySchema }),
  asyncHandler(linkAssetContext),
);
// View the history of asset link changes.
assetsRouter.get(
  '/:assetId/context/history',
  authenticate,
  validate({ params: assetIdParamsSchema, query: assetContextHistoryQuerySchema }),
  asyncHandler(getAssetContextHistory),
);
// View the history of asset classification changes.
assetsRouter.get(
  '/:assetId/classify-criticality/history',
  authenticate,
  validate({ params: assetIdParamsSchema, query: assetClassificationHistoryQuerySchema }),
  asyncHandler(getAssetClassificationHistory),
);
// Create an asset with basic details and an optional owner.
assetsRouter.post(
  '/',
  authenticate,
  validate({ body: createAssetBodySchema }),
  asyncHandler(createAsset),
);
// View one asset and its related records.
assetsRouter.get(
  '/:assetId',
  authenticate,
  validate({ params: assetIdParamsSchema }),
  asyncHandler(getAsset),
);
