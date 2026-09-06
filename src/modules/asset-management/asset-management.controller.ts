import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { assetManagementService } from './asset-management.service.js';
import { listAssetsQuerySchema } from './dto/list-assets-query.dto.js';

export const listAssets: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');

  const query = listAssetsQuerySchema.parse(req.query);
  const data = await assetManagementService.list(query, req.auth);
  res.status(200).json({ success: true, data });
};

export const assetManagementController = { listAssets } as const;
