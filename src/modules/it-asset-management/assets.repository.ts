import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
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
        archive_reason: true,
        archive_actor: { select: { id: true, full_name: true, status: true } },
        classification_confidentiality_impact: true,
        classification_integrity_impact: true,
        classification_availability_impact: true,
        classification_business_impact: true,
        classification_rationale: true,
        data_classification_basis: true,
        data_classification_method_version: true,
        classification_method_version: true,
        classified_at: true,
        classification_assessor: { select: { id: true, full_name: true, status: true } },
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
  archive(assetId: string, userId: string, reason: string, correlationId: string | null) {
    return prisma.$transaction(async (tx) => {
      const actor = await tx.users.findUnique({ where: { id: userId }, select: { role: true, status: true } });
      if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'SECURITY_OFFICER') return { kind: 'forbidden' } as const;
      const asset = await tx.assets.findUnique({ where: { id: assetId }, select: { status: true, archived_at: true } });
      if (!asset) return { kind: 'not_found' } as const;
      if (asset.status !== 'ACTIVE') return { kind: 'archived' } as const;
      const dependencyWhere = { depends_on_asset_id: assetId, assets_asset_dependencies_asset_idToassets: { status: 'ACTIVE' as const } };
      const count = await tx.asset_dependencies.count({ where: dependencyWhere });
      if (count) {
        const dependencies = await tx.asset_dependencies.findMany({
          where: dependencyWhere, take: 20, orderBy: { asset_id: 'asc' },
          select: { assets_asset_dependencies_asset_idToassets: { select: { asset_code: true, name: true } } },
        });
        return { kind: 'dependencies', count, dependencies } as const;
      }
      // Use the same database clock as the existing updated_at trigger.
      const [clock] = await tx.$queryRaw<Array<{ at: Date }>>`SELECT transaction_timestamp() AS at`;
      if (!clock) throw new Error('Database archive timestamp unavailable');
      const at = clock.at;
      await tx.assets.update({ where: { id: assetId }, data: { status: 'ARCHIVED', archived_at: at, archived_by: userId, archive_reason: reason, updated_at: at }, select: { id: true } });
      const id = randomUUID();
      const before = { status: asset.status, archivedAt: asset.archived_at?.toISOString() ?? null };
      const after = { status: 'ARCHIVED', archivedAt: at.toISOString(), archivedBy: userId, archiveReason: reason };
      await tx.audit_logs.create({ data: {
        id, actor_type: 'USER', actor_user_id: userId, action: 'ASSET_ARCHIVED',
        resource_type: 'ASSET', resource_id: assetId, occurred_at: at, source: 'API',
        correlation_id: correlationId, before_data: before, after_data: after,
        record_hash: createHash('sha256').update(JSON.stringify({ id, actor: userId, assetId, at: at.toISOString(), before, after, correlationId })).digest('hex'),
      } });
      return { kind: 'updated' } as const;
    }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
  },
  assignOwner(assetId: string, ownerUserId: string | null) { return prisma.assets.update({ where: { id: assetId }, data: { owner_user_id: ownerUserId }, select: { id: true, updated_at: true, users_assets_owner_user_idTousers: { select: { id: true, full_name: true, status: true } } } }); },
  classify(assetId: string, criticality: string, input: ClassifyAssetInput, userId: string, methodVersion: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await tx.users.findUnique({ where: { id: userId }, select: { role: true, status: true } });
      if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'SECURITY_OFFICER') return { kind: 'forbidden' } as const;
      const current = await tx.assets.findUnique({ where: { id: assetId }, select: { status: true, criticality: true, data_classification: true } });
      if (!current) return { kind: 'not_found' } as const;
      if (current.status !== 'ACTIVE') return { kind: 'archived' } as const;
      const asset = await tx.assets.update({
        where: { id: assetId },
        data: { criticality, data_classification: input.dataClassification,
          classification_confidentiality_impact: input.confidentialityImpact,
          classification_integrity_impact: input.integrityImpact,
          classification_availability_impact: input.availabilityImpact,
          classification_business_impact: input.businessImpact,
          classification_rationale: input.rationale, classification_method_version: methodVersion,
          data_classification_basis: input.dataClassificationBasis,
          data_classification_method_version: 'SECURAAI-DATA-CLASSIFICATION-v1',
          classified_by: userId, classified_at: new Date(), updated_at: new Date(),
        },
        select: { id: true, criticality: true, data_classification: true, classified_at: true },
      });
      return { kind: 'updated', asset, previous: current } as const;
    }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
  },
  linkContext(assetId: string, input: LinkAssetContextInput, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await tx.users.findUnique({ where: { id: userId }, select: { role: true, status: true } });
      if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'SECURITY_OFFICER') return { kind: 'forbidden' } as const;
      const current = await tx.assets.findUnique({ where: { id: assetId }, select: { status: true, business_service_id: true, asset_dependencies_asset_dependencies_asset_idToassets: { select: { depends_on_asset_id: true } }, asset_event_sources: { select: { event_source_id: true } } } });
      if (!current) return { kind: 'not_found' } as const;
      if (current.status !== 'ACTIVE') return { kind: 'archived' } as const;
      const oldDependencies = current.asset_dependencies_asset_dependencies_asset_idToassets.map((link) => link.depends_on_asset_id);
      const oldSources = current.asset_event_sources.map((link) => link.event_source_id);
      const addedDependencies = input.dependencyIds.filter((id) => !oldDependencies.includes(id));
      const addedSources = input.eventSourceIds.filter((id) => !oldSources.includes(id));
      if (input.businessServiceId && input.businessServiceId !== current.business_service_id && !await tx.business_services.findFirst({ where: { id: input.businessServiceId, status: 'ACTIVE' }, select: { id: true } })) return { kind: 'invalid_service' } as const;
      if (addedDependencies.length && await tx.assets.count({ where: { id: { in: addedDependencies }, status: 'ACTIVE' } }) !== addedDependencies.length) return { kind: 'invalid_dependency' } as const;
      if (addedSources.length && await tx.event_sources.count({ where: { id: { in: addedSources }, status: 'ACTIVE' } }) !== addedSources.length) return { kind: 'invalid_source' } as const;
      // UNION deduplicates visited nodes, so pre-existing cycles cannot recurse forever.
      if (input.dependencyIds.length) {
        const [cycle] = await tx.$queryRaw<Array<{ has_cycle: boolean }>>(Prisma.sql`
          WITH RECURSIVE reachable(id) AS (
            SELECT unnest(ARRAY[${Prisma.join(input.dependencyIds)}]::uuid[])
            UNION
            SELECT dependency.depends_on_asset_id
            FROM public.asset_dependencies AS dependency
            JOIN reachable ON dependency.asset_id = reachable.id
          )
          SELECT EXISTS(SELECT 1 FROM reachable WHERE id = ${assetId}::uuid) AS has_cycle
        `);
        if (cycle?.has_cycle) return { kind: 'cycle' } as const;
      }
      const asset = await tx.assets.update({
      where: { id: assetId },
      data: {
        business_service_id: input.businessServiceId,
        asset_dependencies_asset_dependencies_asset_idToassets: {
          deleteMany: { depends_on_asset_id: { notIn: input.dependencyIds } },
          create: addedDependencies.map((id) => ({
            assets_asset_dependencies_depends_on_asset_idToassets: { connect: { id } },
          })),
        },
        asset_event_sources: {
          deleteMany: { event_source_id: { notIn: input.eventSourceIds } },
          create: addedSources.map((id) => ({ event_source_id: id })),
        },
      },
      select: { id: true, updated_at: true },
      });
      return { kind: 'updated', asset } as const;
    }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
  },
};
