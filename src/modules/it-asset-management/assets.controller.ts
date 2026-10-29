import type { RequestHandler } from 'express';
import { assetOwnerOptionsQuerySchema } from './dto/asset-owner-options.dto.js';
import { AppError } from '../../common/errors/app-error.js';
import { assetIdParamsSchema, listAssetsQuerySchema } from './dto/list-assets.dto.js';
import { createAssetBodySchema } from './dto/create-asset.dto.js';
import { updateAssetBodySchema } from './dto/update-asset.dto.js';
import { assignAssetOwnerBodySchema } from './dto/assign-asset-owner.dto.js';
import { classifyAssetBodySchema, assetClassificationHistoryQuerySchema } from './dto/classify-asset.dto.js';
import { linkAssetContextBodySchema, assetContextHistoryQuerySchema } from './dto/link-asset-context.dto.js';
import { assetsService } from './assets.service.js';
import { archiveAssetBodySchema } from './dto/archive-asset.dto.js';
function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
export const listAssets: RequestHandler = async (req, res) => {
  const data = await assetsService.list(
    authenticatedUserId(res.locals.authenticatedUserId),
    listAssetsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};
export const getAsset: RequestHandler = async (req, res) => {
  const { assetId } = assetIdParamsSchema.parse(req.params);
  const data = await assetsService.get(
    authenticatedUserId(res.locals.authenticatedUserId),
    assetId,
  );
  res.status(200).json({ success: true, data });
};
export const getAssetCreateOptions: RequestHandler = async (_req, res) => {
  const data = await assetsService.createOptions(
    authenticatedUserId(res.locals.authenticatedUserId),
  );
  res.status(200).json({ success: true, data });
};
export const getAssetOwnerOptions: RequestHandler = async (req, res) => {
  const { q } = assetOwnerOptionsQuerySchema.parse(req.query);
  const data = await assetsService.ownerOptions(authenticatedUserId(res.locals.authenticatedUserId), q);
  res.status(200).json({ success: true, data });
};
export const createAsset: RequestHandler = async (req, res) => {
  const data = await assetsService.create(
    authenticatedUserId(res.locals.authenticatedUserId),
    createAssetBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const updateAsset: RequestHandler = async (req, res) => { const { assetId } = assetIdParamsSchema.parse(req.params); const data = await assetsService.update(authenticatedUserId(res.locals.authenticatedUserId), assetId, updateAssetBodySchema.parse(req.body)); res.status(200).json({ success: true, data }); };
export const archiveAsset: RequestHandler = async (req, res) => {
  const { assetId } = assetIdParamsSchema.parse(req.params);
  const requestId: unknown = req.id;
  await assetsService.archive(authenticatedUserId(res.locals.authenticatedUserId), assetId,
    archiveAssetBodySchema.parse(req.body), typeof requestId === 'string' ? requestId.slice(0, 255) : null);
  res.status(204).send();
};
export const assignAssetOwner: RequestHandler = async (req, res) => { const { assetId } = assetIdParamsSchema.parse(req.params); const data = await assetsService.assignOwner(authenticatedUserId(res.locals.authenticatedUserId), assetId, assignAssetOwnerBodySchema.parse(req.body)); res.status(200).json({ success: true, data }); };
export const classifyAsset: RequestHandler = async (req, res) => {
  const { assetId } = assetIdParamsSchema.parse(req.params);
  const data = await assetsService.classify(authenticatedUserId(res.locals.authenticatedUserId), assetId, classifyAssetBodySchema.parse(req.body));
  res.status(200).json({ success: true, data });
};
export const linkAssetContext: RequestHandler = async (req, res) => {
  const { assetId } = assetIdParamsSchema.parse(req.params);
  const data = await assetsService.linkContext(authenticatedUserId(res.locals.authenticatedUserId), assetId, linkAssetContextBodySchema.parse(req.body));
  res.status(200).json({ success: true, data });
};
export const getAssetContextHistory: RequestHandler = async (req, res) => {
  const { assetId } = assetIdParamsSchema.parse(req.params);
  const data = await assetsService.contextHistory(authenticatedUserId(res.locals.authenticatedUserId), assetId, assetContextHistoryQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
};
export const getAssetClassificationHistory: RequestHandler = async (req, res) => {
  const { assetId } = assetIdParamsSchema.parse(req.params);
  const data = await assetsService.classificationHistory(authenticatedUserId(res.locals.authenticatedUserId), assetId, assetClassificationHistoryQuerySchema.parse(req.query));
  res.status(200).json({ success: true, data });
};
