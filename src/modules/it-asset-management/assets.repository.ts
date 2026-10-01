import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListAssetsQuery } from './dto/list-assets.dto.js';
import type { CreateAssetInput } from './dto/create-asset.dto.js';
import type { UpdateAssetInput } from './dto/update-asset.dto.js';
import type { ClassifyAssetInput } from './dto/classify-asset.dto.js';
import type { LinkAssetContextInput } from './dto/link-asset-context.dto.js';
const select = {
  id: true,
  asset_code: true,
  name: true,
  asset_type: true,
  criticality: true,
  data_classification: true,
  description: true,
  status: true,
  owner_user_id: true,
  created_at: true,
  updated_at: true,
  users_assets_owner_user_idTousers: { select: { id: true, full_name: true, status: true } },
  business_services: { select: { id: true, name: true, status: true } },
} as const;
function where(query: ListAssetsQuery): Prisma.assetsWhereInput {
  return {
    ...(query.status ? { status: query.status.toUpperCase() as 'ACTIVE' | 'ARCHIVED' } : {}),
    ...(query.assetType ? { asset_type: { equals: query.assetType, mode: 'insensitive' } } : {}),
    ...(query.criticality
      ? { criticality: { equals: query.criticality, mode: 'insensitive' } }
      : {}),
    ...(query.ownerUserId ? { owner_user_id: query.ownerUserId } : {}),
    ...(query.businessServiceId ? { business_service_id: query.businessServiceId } : {}),
    ...(query.q
      ? {
          OR: [
            { asset_code: { contains: query.q, mode: 'insensitive' } },
            { name: { contains: query.q, mode: 'insensitive' } },
            { asset_type: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
            {
              users_assets_owner_user_idTousers: {
                full_name: { contains: query.q, mode: 'insensitive' },
              },
            },
            { business_services: { name: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}
function orderBy(query: ListAssetsQuery): Prisma.assetsOrderByWithRelationInput[] {
  const field = {
    assetCode: 'asset_code',
    name: 'name',
    assetType: 'asset_type',
    criticality: 'criticality',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }[query.sortBy] as
    'asset_code' | 'name' | 'asset_type' | 'criticality' | 'created_at' | 'updated_at';
  return [{ [field]: query.sortOrder }, { id: query.sortOrder }];
}
export const assetsRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  },
  list(query: ListAssetsQuery) {
    const filters = where(query);
    return prisma.$transaction([
      prisma.assets.count({ where: filters }),
      prisma.assets.findMany({
        where: filters,
        select,
        orderBy: orderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },
  findById(assetId: string) {
    return prisma.assets.findUnique({
      where: { id: assetId },
      select: {
        ...select,
        archived_at: true,
        users_assets_created_byTousers: { select: { id: true, full_name: true, status: true } },
        asset_dependencies_asset_dependencies_asset_idToassets: {
          select: {
            id: true,
            dependency_type: true,
            description: true,
            assets_asset_dependencies_depends_on_asset_idToassets: {
              select: { id: true, asset_code: true, name: true, status: true },
            },
          },
        },
        control_asset_links: {
          select: {
            security_controls: {
              select: { id: true, control_code: true, name: true, implementation_status: true },
            },
          },
        },
        asset_event_sources: {
          select: {
            event_sources: { select: { id: true, name: true, source_type: true, status: true } },
          },
        },
        risk_assets: {
          select: { risks: { select: { id: true, risk_code: true, title: true, status: true } } },
        },
        incident_assets: {
          select: {
            incidents: {
              select: { id: true, incident_code: true, title: true, severity: true, status: true },
            },
          },
        },
      },
    });
  },
  findCreateOptions() {
    return Promise.all([
      prisma.users.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, full_name: true, role: true },
        orderBy: { full_name: 'asc' },
        take: 200,
      }),
      prisma.business_services.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      prisma.assets.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, asset_code: true, name: true },
        orderBy: { asset_code: 'asc' },
        take: 200,
      }),
      prisma.event_sources.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, source_type: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
    ]);
  },
  async validateCreateReferences(input: {
    ownerUserId?: string;
    businessServiceId?: string;
    dependencyIds: string[];
    eventSourceIds: string[];
  }) {
    const [owner, service, dependencies, sources] = await Promise.all([
      input.ownerUserId
        ? prisma.users.findFirst({
            where: { id: input.ownerUserId, status: 'ACTIVE' },
            select: { id: true },
          })
        : null,
      input.businessServiceId
        ? prisma.business_services.findFirst({
            where: { id: input.businessServiceId, status: 'ACTIVE' },
            select: { id: true },
          })
        : null,
      prisma.assets.count({ where: { id: { in: input.dependencyIds }, status: 'ACTIVE' } }),
      prisma.event_sources.count({ where: { id: { in: input.eventSourceIds }, status: 'ACTIVE' } }),
    ]);
    return {
      ownerValid: !input.ownerUserId || Boolean(owner),
      serviceValid: !input.businessServiceId || Boolean(service),
      dependenciesValid: dependencies === input.dependencyIds.length,
      eventSourcesValid: sources === input.eventSourceIds.length,
    };
  },
  create(actorUserId: string, input: CreateAssetInput) {
    return prisma.assets.create({
      data: {
        asset_code: input.assetCode,
        name: input.name,
        asset_type: input.assetType,
        criticality: input.criticality,
        data_classification: input.dataClassification,
        created_by: actorUserId,
        ...(input.description ? { description: input.description } : {}),
        ...(input.ownerUserId ? { owner_user_id: input.ownerUserId } : {}),
        ...(input.businessServiceId ? { business_service_id: input.businessServiceId } : {}),
        asset_dependencies_asset_dependencies_asset_idToassets: {
          create: input.dependencies.map((dependency) => ({
            assets_asset_dependencies_depends_on_asset_idToassets: {
              connect: { id: dependency.assetId },
            },
            ...(dependency.type ? { dependency_type: dependency.type } : {}),
            ...(dependency.description ? { description: dependency.description } : {}),
          })),
        },
        asset_event_sources: {
          create: input.eventSourceIds.map((eventSourceId) => ({ event_source_id: eventSourceId })),
        },
      },
      select,
    });
  },
  update(assetId: string, input: UpdateAssetInput) {
    return prisma.assets.update({ where: { id: assetId }, data: {
      name: input.name, asset_type: input.assetType, description: input.description,
    }, select });
  },
  archive(assetId: string) { return prisma.assets.update({ where: { id: assetId }, data: { status: 'ARCHIVED', archived_at: new Date() }, select: { id: true } }); },
  assignOwner(assetId: string, ownerUserId: string | null) { return prisma.assets.update({ where: { id: assetId }, data: { owner_user_id: ownerUserId }, select: { id: true, updated_at: true, users_assets_owner_user_idTousers: { select: { id: true, full_name: true, status: true } } } }); },
  classify(assetId: string, criticality: string, input: ClassifyAssetInput) {
    return prisma.assets.update({
      where: { id: assetId },
      data: { criticality, data_classification: input.dataClassification },
      select: { id: true, criticality: true, data_classification: true, updated_at: true },
    });
  },
  linkContext(assetId: string, input: LinkAssetContextInput) {
    return prisma.assets.update({
      where: { id: assetId },
      data: {
        business_service_id: input.businessServiceId,
        asset_dependencies_asset_dependencies_asset_idToassets: {
          deleteMany: {},
          create: input.dependencyIds.map((id) => ({
            assets_asset_dependencies_depends_on_asset_idToassets: { connect: { id } },
          })),
        },
        asset_event_sources: {
          deleteMany: {},
          create: input.eventSourceIds.map((id) => ({ event_source_id: id })),
        },
      },
      select: { id: true, updated_at: true },
    });
  },
};
