import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { assetManagementService } from './asset-management.service.js';
import { classifyAssetCriticalityBodySchema } from './dto/classify-asset-criticality.dto.js';
import { assignAssetOwnerBodySchema } from './dto/assign-asset-owner.dto.js';
import { assetImportJobParamsSchema } from './dto/import-asset-row.dto.js';
import { createAssetBodySchema } from './dto/create-asset.dto.js';
import { listAssetsQuerySchema } from './dto/list-assets-query.dto.js';
import { updateAssetBodySchema, updateAssetParamsSchema } from './dto/update-asset.dto.js';
import { createAssetImportTemplate } from './import/asset-import.parser.js';
import { assetImportService } from './import/asset-import.service.js';
import { exportAssetsQuerySchema } from './dto/export-assets-query.dto.js';
import { assetExportService } from './export/asset-export.service.js';
import { listAssetHistoryQuerySchema } from './dto/list-asset-history-query.dto.js';

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

export const classifyAssetCriticality: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

  const { assetId } = updateAssetParamsSchema.parse(req.params);
  const body = classifyAssetCriticalityBodySchema.parse(req.body);
  const data = await assetManagementService.classifyCriticality(assetId, body, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const assignAssetOwner: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

  const { assetId } = updateAssetParamsSchema.parse(req.params);
  const body = assignAssetOwnerBodySchema.parse(req.body);
  const data = await assetManagementService.assignOwner(assetId, body, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const importAssets: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (!req.file) throw new AppError(422, 'INVALID_IMPORT_FILE', 'An Excel file is required');

  const data = await assetImportService.importAssets(
    {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    },
    req.auth,
    {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
    },
  );
  res.status(200).json({ success: true, data });
};

export const getAssetImportJob: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { importJobId } = assetImportJobParamsSchema.parse(req.params);
  const data = await assetImportService.getImportJob(importJobId, req.auth);
  res.status(200).json({ success: true, data });
};

export const downloadAssetImportTemplate: RequestHandler = async (_req, res) => {
  const template = await createAssetImportTemplate();
  res
    .status(200)
    .set({
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="asset-import-template.xlsx"',
    })
    .send(template);
};

export const exportAssets: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const query = exportAssetsQuerySchema.parse(req.query);
  const result = await assetExportService.exportAssets(query, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res
    .status(200)
    .set({
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${result.filename}"`,
      'x-exported-rows': String(result.exportedRows),
    })
    .send(result.buffer);
};

export const listAssetHistory: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { assetId } = updateAssetParamsSchema.parse(req.params);
  const query = listAssetHistoryQuerySchema.parse(req.query);
  const data = await assetManagementService.listHistory(assetId, query, req.auth);
  res.status(200).json({ success: true, data });
};

export const assetManagementController = {
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
} as const;
