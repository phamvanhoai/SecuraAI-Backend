import { AppError } from '../../common/errors/app-error.js';
import { toAssetListItem } from './asset-management.mapper.js';
import { assetManagementRepository } from './asset-management.repository.js';
import type { ListAssetsQuery } from './dto/list-assets-query.dto.js';

type AssetListActor = {
  userId: string;
  permissions: readonly string[];
};

export const assetManagementService = {
  async list(query: ListAssetsQuery, actor: AssetListActor) {
    if (!actor.permissions.includes('assets.read')) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }

    const result = await assetManagementRepository.list(query);
    return {
      items: result.items.map(toAssetListItem),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
};
