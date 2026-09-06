import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListAssetsQuery } from './dto/list-assets-query.dto.js';

export const assetListSelect = {
  asset_id: true,
  asset_code: true,
  name: true,
  asset_type: true,
  criticality: true,
  status: true,
  location: true,
  updated_at: true,
  departments: {
    select: {
      department_id: true,
      code: true,
      name: true,
    },
  },
  users_assets_owner_user_idTousers: {
    select: {
      user_id: true,
      full_name: true,
    },
  },
} satisfies Prisma.assetsSelect;

export type AssetListRecord = Prisma.assetsGetPayload<{ select: typeof assetListSelect }>;

const buildWhere = (query: ListAssetsQuery): Prisma.assetsWhereInput => ({
  deleted_at: null,
  ...(query.assetType !== undefined && { asset_type: query.assetType }),
  ...(query.criticality !== undefined && { criticality: query.criticality }),
  ...(query.status !== undefined && { status: query.status }),
  ...(query.departmentId !== undefined && { department_id: query.departmentId }),
  ...(query.ownerUserId !== undefined && { owner_user_id: query.ownerUserId }),
  ...(query.q !== undefined && {
    OR: [
      { asset_code: { contains: query.q, mode: 'insensitive' } },
      { name: { contains: query.q, mode: 'insensitive' } },
      { hostname: { contains: query.q, mode: 'insensitive' } },
      { location: { contains: query.q, mode: 'insensitive' } },
    ],
  }),
});

const buildOrderBy = (
  sortBy: ListAssetsQuery['sortBy'],
  sortOrder: ListAssetsQuery['sortOrder'],
): Prisma.assetsOrderByWithRelationInput[] => {
  switch (sortBy) {
    case 'name':
      return [{ name: sortOrder }, { asset_id: 'asc' }];
    case 'createdAt':
      return [{ created_at: sortOrder }, { asset_id: 'asc' }];
    case 'updatedAt':
      return [{ updated_at: sortOrder }, { asset_id: 'asc' }];
    case 'assetCode':
      return [{ asset_code: sortOrder }, { asset_id: 'asc' }];
  }
};

export const assetManagementRepository = {
  async list(query: ListAssetsQuery): Promise<{ items: AssetListRecord[]; total: number }> {
    const where = buildWhere(query);
    const [total, items] = await prisma.$transaction([
      prisma.assets.count({ where }),
      prisma.assets.findMany({
        where,
        select: assetListSelect,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return { items, total };
  },
};
