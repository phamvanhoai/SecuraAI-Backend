import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  assignAssetOwner,
  classifyAssetCriticality,
  createAsset,
  deleteAsset,
  listAssets,
  updateAsset,
  importAssets,
  getAssetImportJob,
  downloadAssetImportTemplate,
  exportAssets,
  listAssetHistory,
} from './asset-management.controller.js';
import { assignAssetOwnerBodySchema } from './dto/assign-asset-owner.dto.js';
import { classifyAssetCriticalityBodySchema } from './dto/classify-asset-criticality.dto.js';
import { createAssetBodySchema } from './dto/create-asset.dto.js';
import { listAssetsQuerySchema } from './dto/list-assets-query.dto.js';
import { updateAssetBodySchema, updateAssetParamsSchema } from './dto/update-asset.dto.js';
import { assetImportJobParamsSchema } from './dto/import-asset-row.dto.js';
import { uploadAssetWorkbook } from './import/asset-import.upload.js';
import { exportAssetsQuerySchema } from './dto/export-assets-query.dto.js';
import { listAssetHistoryQuerySchema } from './dto/list-asset-history-query.dto.js';

export const assetManagementRouter = Router();

const assetImportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

const assetExportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

assetManagementRouter.get(
  '/export',
  authenticate,
  authorize('assets.export'),
  assetExportRateLimit,
  validate({ query: exportAssetsQuerySchema }),
  asyncHandler(exportAssets),
);

assetManagementRouter.get(
  '/import-template',
  authenticate,
  authorize('assets.import'),
  asyncHandler(downloadAssetImportTemplate),
);

assetManagementRouter.get(
  '/imports/:importJobId',
  authenticate,
  authorize('assets.import'),
  validate({ params: assetImportJobParamsSchema }),
  asyncHandler(getAssetImportJob),
);

assetManagementRouter.post(
  '/import',
  authenticate,
  authorize('assets.import'),
  assetImportRateLimit,
  uploadAssetWorkbook,
  asyncHandler(importAssets),
);

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

assetManagementRouter.post(
  '/:assetId/classify-criticality',
  authenticate,
  authorize('assets.classify'),
  validate({ params: updateAssetParamsSchema, body: classifyAssetCriticalityBodySchema }),
  asyncHandler(classifyAssetCriticality),
);

assetManagementRouter.put(
  '/:assetId/owner',
  authenticate,
  authorize('assets.assign-owner'),
  validate({ params: updateAssetParamsSchema, body: assignAssetOwnerBodySchema }),
  asyncHandler(assignAssetOwner),
);

assetManagementRouter.get(
  '/:assetId/history',
  authenticate,
  authorize('assets.history.read'),
  validate({ params: updateAssetParamsSchema, query: listAssetHistoryQuerySchema }),
  asyncHandler(listAssetHistory),
);
