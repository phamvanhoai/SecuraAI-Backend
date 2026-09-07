import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createAsset,
  deleteAsset,
  listAssets,
  updateAsset,
} from './asset-management.controller.js';
import { createAssetBodySchema } from './dto/create-asset.dto.js';
import { listAssetsQuerySchema } from './dto/list-assets-query.dto.js';
import { updateAssetBodySchema, updateAssetParamsSchema } from './dto/update-asset.dto.js';

export const assetManagementRouter = Router();

assetManagementRouter.post(
  '/',
  authenticate,
  authorize('assets.create'),
  validate({ body: createAssetBodySchema }),
  asyncHandler(createAsset),
);

assetManagementRouter.get(
  '/',
  authenticate,
  authorize('assets.read'),
  validate({ query: listAssetsQuerySchema }),
  asyncHandler(listAssets),
);

assetManagementRouter.patch(
  '/:assetId',
  authenticate,
  authorize('assets.update'),
  validate({ params: updateAssetParamsSchema, body: updateAssetBodySchema }),
  asyncHandler(updateAsset),
);

assetManagementRouter.delete(
  '/:assetId',
  authenticate,
  authorize('assets.delete'),
  validate({ params: updateAssetParamsSchema }),
  asyncHandler(deleteAsset),
);
