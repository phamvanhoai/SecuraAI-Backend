import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { toAssetDetail, toAssetListItem } from './asset-management.mapper.js';
import { assetManagementRepository } from './asset-management.repository.js';
import type { CreateAssetBody } from './dto/create-asset.dto.js';
import type { ListAssetsQuery } from './dto/list-assets-query.dto.js';

type AssetListActor = {
  userId: string;
  permissions: readonly string[];
};

type CreateAssetContext = {
  ipAddress: string | null;
  userAgent: string | null;
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

  async create(input: CreateAssetBody, actor: AssetListActor, context: CreateAssetContext) {
    if (!actor.permissions.includes('assets.create')) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }

    if (await assetManagementRepository.findByCode(input.assetCode)) {
      throw new AppError(409, 'ASSET_CODE_EXISTS', 'Asset code already exists');
    }

    if (input.departmentId !== undefined) {
      const department = await assetManagementRepository.findDepartmentById(input.departmentId);
      if (!department) {
        throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department was not found');
      }
      if (department.status !== 'active') {
        throw new AppError(422, 'DEPARTMENT_INACTIVE', 'Department is not active');
      }
    }

    if (input.ownerUserId !== undefined) {
      const owner = await assetManagementRepository.findOwnerById(input.ownerUserId);
      if (!owner) throw new AppError(404, 'ASSET_OWNER_NOT_FOUND', 'Asset owner was not found');
      if (owner.status !== 'active') {
        throw new AppError(422, 'ASSET_OWNER_INACTIVE', 'Asset owner is not active');
      }
    }

    try {
      const asset = await assetManagementRepository.create(input, {
        actorUserId: actor.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return toAssetDetail(asset);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'ASSET_CODE_EXISTS', 'Asset code already exists');
      }
      throw error;
    }
  },
};
