import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListAssetsQuery } from './dto/list-assets-query.dto.js';
import type { CreateAssetBody } from './dto/create-asset.dto.js';
import type { ClassifyAssetCriticalityBody } from './dto/classify-asset-criticality.dto.js';
import type { UpdateAssetBody } from './dto/update-asset.dto.js';

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
  department_id: true,
  owner_user_id: true,
  metadata: true,
  retired_at: true,
  created_at: true,
} satisfies Prisma.assetsSelect;

export type AssetDetailRecord = Prisma.assetsGetPayload<{ select: typeof assetDetailSelect }>;

type CreateAssetContext = {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AssetUpdateChanges = UpdateAssetBody & { retiredAt?: Date | null };

type UpdateAssetContext = CreateAssetContext & {
  beforeData: Prisma.InputJsonObject;
  afterData: Prisma.InputJsonObject;
};

export type CriticalityClassification = {
  previousCriticality: string;
  criticality: string;
  score: number;
  changed: boolean;
  classifiedAt: Date;
  criteria: Omit<ClassifyAssetCriticalityBody, 'reason'>;
  reason: string;
};

export type AssetDependencyCounts = {
  riskAssessments: number;
  openAlerts: number;
  activeLogSources: number;
  enabledAlertThresholds: number;
  openIncidents: number;
};

export type DeleteAssetResult =
  | { kind: 'not_found' }
  | { kind: 'blocked'; dependencies: AssetDependencyCounts }
  | { kind: 'deleted' };

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

  findById(assetId: string): Promise<AssetDetailRecord | null> {
    return prisma.assets.findFirst({
      where: { asset_id: assetId, deleted_at: null },
      select: assetDetailSelect,
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

  update(
    assetId: string,
    changes: AssetUpdateChanges,
    context: UpdateAssetContext,
  ): Promise<AssetDetailRecord> {
    return prisma.$transaction(async (transaction) => {
      const asset = await transaction.assets.update({
        where: { asset_id: assetId, deleted_at: null },
        data: {
          ...(changes.name !== undefined && { name: changes.name }),
          ...(changes.assetType !== undefined && { asset_type: changes.assetType }),
          ...(changes.description !== undefined && { description: changes.description }),
          ...(changes.departmentId !== undefined && { department_id: changes.departmentId }),
          ...(changes.ownerUserId !== undefined && { owner_user_id: changes.ownerUserId }),
          ...(changes.hostname !== undefined && { hostname: changes.hostname }),
          ...(changes.ipAddress !== undefined && { ip_address: changes.ipAddress }),
          ...(changes.location !== undefined && { location: changes.location }),
          ...(changes.status !== undefined && { status: changes.status }),
          ...(changes.metadata !== undefined && { metadata: changes.metadata }),
          ...(changes.retiredAt !== undefined && { retired_at: changes.retiredAt }),
          updated_at: new Date(),
        },
        select: assetDetailSelect,
      });

      await transaction.asset_change_history.create({
        data: {
          asset_id: assetId,
          changed_by_user_id: context.actorUserId,
          action: 'updated',
          before_data: context.beforeData,
          after_data: context.afterData,
        },
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'asset-management',
          action: 'asset.updated',
          entity_type: 'asset',
          entity_id: assetId,
          before_data: context.beforeData,
          after_data: context.afterData,
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });

      return asset;
    });
  },

  softDelete(assetId: string, context: CreateAssetContext): Promise<DeleteAssetResult> {
    return prisma.$transaction(
      async (transaction) => {
        const asset = await transaction.assets.findFirst({
          where: { asset_id: assetId, deleted_at: null },
          select: { asset_id: true, asset_code: true, name: true, status: true },
        });
        if (!asset) return { kind: 'not_found' };

        const [
          riskAssessments,
          openAlerts,
          activeLogSources,
          enabledAlertThresholds,
          openIncidents,
        ] = await Promise.all([
          transaction.risk_assessments.count({
            where: { asset_id: assetId, status: { notIn: ['closed', 'rejected'] } },
          }),
          transaction.ai_alerts.count({
            where: { asset_id: assetId, status: { in: ['new', 'reviewing', 'confirmed'] } },
          }),
          transaction.log_sources.count({ where: { asset_id: assetId, status: 'active' } }),
          transaction.asset_alert_thresholds.count({ where: { asset_id: assetId, enabled: true } }),
          transaction.incident_alert_links.count({
            where: {
              ai_alerts: { asset_id: assetId },
              incidents: { closed_at: null },
            },
          }),
        ]);
        const dependencies = {
          riskAssessments,
          openAlerts,
          activeLogSources,
          enabledAlertThresholds,
          openIncidents,
        };
        if (Object.values(dependencies).some((count) => count > 0)) {
          return { kind: 'blocked', dependencies };
        }

        const deletedAt = new Date();
        const beforeData: Prisma.InputJsonObject = {
          assetId: asset.asset_id,
          assetCode: asset.asset_code,
          name: asset.name,
          status: asset.status,
          deletedAt: null,
        };
        const afterData: Prisma.InputJsonObject = {
          assetId: asset.asset_id,
          assetCode: asset.asset_code,
          name: asset.name,
          status: 'inactive',
          deletedAt: deletedAt.toISOString(),
        };

        await transaction.assets.update({
          where: { asset_id: assetId, deleted_at: null },
          data: { status: 'inactive', deleted_at: deletedAt, updated_at: deletedAt },
        });
        await transaction.asset_change_history.create({
          data: {
            asset_id: assetId,
            changed_by_user_id: context.actorUserId,
            action: 'deleted',
            before_data: beforeData,
            after_data: afterData,
          },
        });
        await transaction.audit_logs.create({
          data: {
            actor_user_id: context.actorUserId,
            module: 'asset-management',
            action: 'asset.deleted',
            entity_type: 'asset',
            entity_id: assetId,
            before_data: beforeData,
            after_data: afterData,
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
          },
        });

        return { kind: 'deleted' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  },

  classifyCriticality(
    assetId: string,
    classification: CriticalityClassification,
    context: CreateAssetContext,
  ): Promise<void> {
    return prisma.$transaction(async (transaction) => {
      if (classification.changed) {
        await transaction.assets.update({
          where: { asset_id: assetId, deleted_at: null },
          data: {
            criticality: classification.criticality,
            updated_at: classification.classifiedAt,
          },
        });
      }

      const beforeData: Prisma.InputJsonObject = {
        criticality: classification.previousCriticality,
      };
      const afterData: Prisma.InputJsonObject = {
        criticality: classification.criticality,
        score: classification.score,
        criteria: classification.criteria,
        reason: classification.reason,
        changed: classification.changed,
        classifiedAt: classification.classifiedAt.toISOString(),
      };
      await transaction.asset_change_history.create({
        data: {
          asset_id: assetId,
          changed_by_user_id: context.actorUserId,
          action: 'classified',
          before_data: beforeData,
          after_data: afterData,
        },
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'asset-management',
          action: 'asset.criticality_classified',
          entity_type: 'asset',
          entity_id: assetId,
          before_data: beforeData,
          after_data: afterData,
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
    });
  },
};
