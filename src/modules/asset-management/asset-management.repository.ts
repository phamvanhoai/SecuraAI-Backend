import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListAssetsQuery } from './dto/list-assets-query.dto.js';
import type { CreateAssetBody } from './dto/create-asset.dto.js';

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

export const assetDetailSelect = {
  ...assetListSelect,
  description: true,
  hostname: true,
  ip_address: true,
  created_at: true,
} satisfies Prisma.assetsSelect;

export type AssetDetailRecord = Prisma.assetsGetPayload<{ select: typeof assetDetailSelect }>;

type CreateAssetContext = {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

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

  findByCode(assetCode: string) {
    return prisma.assets.findUnique({
      where: { asset_code: assetCode },
      select: { asset_id: true },
    });
  },

  findDepartmentById(departmentId: string) {
    return prisma.departments.findUnique({
      where: { department_id: departmentId },
      select: { department_id: true, status: true },
    });
  },

  findOwnerById(ownerUserId: string) {
    return prisma.users.findFirst({
      where: { user_id: ownerUserId, deleted_at: null },
      select: { user_id: true, status: true },
    });
  },

  create(input: CreateAssetBody, context: CreateAssetContext): Promise<AssetDetailRecord> {
    return prisma.$transaction(async (transaction) => {
      const asset = await transaction.assets.create({
        data: {
          asset_code: input.assetCode,
          name: input.name,
          asset_type: input.assetType,
          criticality: input.criticality,
          status: 'active',
          created_by_user_id: context.actorUserId,
          ...(input.description !== undefined && { description: input.description }),
          ...(input.departmentId !== undefined && { department_id: input.departmentId }),
          ...(input.ownerUserId !== undefined && { owner_user_id: input.ownerUserId }),
          ...(input.hostname !== undefined && { hostname: input.hostname }),
          ...(input.ipAddress !== undefined && { ip_address: input.ipAddress }),
          ...(input.location !== undefined && { location: input.location }),
          ...(input.metadata !== undefined && { metadata: input.metadata }),
        },
        select: assetDetailSelect,
      });
      const afterData: Prisma.InputJsonObject = {
        assetId: asset.asset_id,
        assetCode: asset.asset_code,
        name: asset.name,
        assetType: asset.asset_type,
        criticality: asset.criticality,
        status: asset.status,
        departmentId: asset.departments?.department_id ?? null,
        ownerUserId: asset.users_assets_owner_user_idTousers?.user_id ?? null,
        createdAt: asset.created_at.toISOString(),
      };

      await transaction.asset_change_history.create({
        data: {
          asset_id: asset.asset_id,
          changed_by_user_id: context.actorUserId,
          action: 'created',
          after_data: afterData,
        },
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'asset-management',
          action: 'asset.created',
          entity_type: 'asset',
          entity_id: asset.asset_id,
          after_data: afterData,
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });

      return asset;
    });
  },
};
