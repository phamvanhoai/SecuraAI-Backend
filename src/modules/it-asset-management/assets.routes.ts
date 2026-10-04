import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { archiveAsset, assignAssetOwner, classifyAsset, createAsset, getAsset, getAssetCreateOptions, linkAssetContext, listAssets, updateAsset } from './assets.controller.js';
import { assetIdParamsSchema, listAssetsQuerySchema } from './dto/list-assets.dto.js';
import { createAssetBodySchema } from './dto/create-asset.dto.js';
import { updateAssetBodySchema } from './dto/update-asset.dto.js';
import { assignAssetOwnerBodySchema } from './dto/assign-asset-owner.dto.js';
import { classifyAssetBodySchema } from './dto/classify-asset.dto.js';
import { linkAssetContextBodySchema } from './dto/link-asset-context.dto.js';
import { archiveAssetBodySchema } from './dto/archive-asset.dto.js';
export const assetsRouter = Router();
assetsRouter.get('/create-options', authenticate, asyncHandler(getAssetCreateOptions));
assetsRouter.get(
  '/',
  authenticate,
  validate({ query: listAssetsQuerySchema }),
  asyncHandler(listAssets),
);
assetsRouter.patch('/:assetId', authenticate, validate({ params: assetIdParamsSchema, body: updateAssetBodySchema }), asyncHandler(updateAsset));
assetsRouter.delete('/:assetId', authenticate, validate({ params: assetIdParamsSchema, body: archiveAssetBodySchema }), asyncHandler(archiveAsset));
assetsRouter.put('/:assetId/owner', authenticate, validate({ params: assetIdParamsSchema, body: assignAssetOwnerBodySchema }), asyncHandler(assignAssetOwner));
assetsRouter.post('/:assetId/classify-criticality', authenticate, validate({ params: assetIdParamsSchema, body: classifyAssetBodySchema }), asyncHandler(classifyAsset));
assetsRouter.put('/:assetId/context', authenticate, validate({ params: assetIdParamsSchema, body: linkAssetContextBodySchema }), asyncHandler(linkAssetContext));
assetsRouter.post(
  '/',
  authenticate,
  validate({ body: createAssetBodySchema }),
  asyncHandler(createAsset),
);
assetsRouter.get(
  '/:assetId',
  authenticate,
  validate({ params: assetIdParamsSchema }),
  asyncHandler(getAsset),
);
