import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { createAsset, listAssets } from './asset-management.controller.js';
import { createAssetBodySchema } from './dto/create-asset.dto.js';
import { listAssetsQuerySchema } from './dto/list-assets-query.dto.js';

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
