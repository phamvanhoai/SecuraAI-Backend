import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { assetManagementService } from './asset-management.service.js';
import { createAssetBodySchema } from './dto/create-asset.dto.js';
import { listAssetsQuerySchema } from './dto/list-assets-query.dto.js';
import { updateAssetBodySchema, updateAssetParamsSchema } from './dto/update-asset.dto.js';

export const listAssets: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

  const query = listAssetsQuerySchema.parse(req.query);
  const data = await assetManagementService.list(query, req.auth);
  res.status(200).json({ success: true, data });
};

export const createAsset: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

  const body = createAssetBodySchema.parse(req.body);
  const data = await assetManagementService.create(body, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(201).json({ success: true, data });
};

export const updateAsset: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

  const { assetId } = updateAssetParamsSchema.parse(req.params);
  const body = updateAssetBodySchema.parse(req.body);
  const data = await assetManagementService.update(assetId, body, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const deleteAsset: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

  const { assetId } = updateAssetParamsSchema.parse(req.params);
  await assetManagementService.delete(assetId, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(204).send();
};

export const assetManagementController = {
  createAsset,
  deleteAsset,
  listAssets,
  updateAsset,
} as const;
