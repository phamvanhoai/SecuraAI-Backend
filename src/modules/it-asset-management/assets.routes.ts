import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { archiveAsset, createAsset, getAsset, getAssetCreateOptions, listAssets, updateAsset } from './assets.controller.js';
import { assetIdParamsSchema, listAssetsQuerySchema } from './dto/list-assets.dto.js';
import { createAssetBodySchema } from './dto/create-asset.dto.js';
import { updateAssetBodySchema } from './dto/update-asset.dto.js';
export const assetsRouter = Router();
assetsRouter.get('/create-options', authenticate, asyncHandler(getAssetCreateOptions));
assetsRouter.get(
  '/',
  authenticate,
  validate({ query: listAssetsQuerySchema }),
  asyncHandler(listAssets),
);
assetsRouter.patch('/:assetId', authenticate, validate({ params: assetIdParamsSchema, body: updateAssetBodySchema }), asyncHandler(updateAsset));
assetsRouter.delete('/:assetId', authenticate, validate({ params: assetIdParamsSchema }), asyncHandler(archiveAsset));
assetsRouter.post(
  '/',
  authenticate,
  validate({ body: createAssetBodySchema }),
  asyncHandler(createAsset),
);
assetsRouter.use(['/import-template', '/export', '/import', '/imports'], (_req, _res, next) =>
  next('router'),
);
assetsRouter.get(
  '/:assetId',
  authenticate,
  validate({ params: assetIdParamsSchema }),
  asyncHandler(getAsset),
);
