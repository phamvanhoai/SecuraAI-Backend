import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateBusinessServiceInput } from './dto/create-business-service.dto.js';
import type { UpdateBusinessServiceInput } from './dto/update-business-service.dto.js';
import type { DeactivateBusinessServiceInput } from './dto/deactivate-business-service.dto.js';
import { prisma } from '../../database/prisma.js';
import type {
  ListBusinessServicesQuery,
  ServicePageQuery,
} from './dto/list-business-services.dto.js';

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  created_at: true,
  updated_at: true,
  users: { select: { id: true, full_name: true, status: true } },
  _count: { select: { assets: true } },
} as const;

export const businessServicesRepository = {
  deactivationCheck(serviceId: string) {
    return prisma.$transaction(
      async (tx) => {
        const service = await tx.business_services.findUnique({
          where: { id: serviceId },
          select: serviceSelect,
        });
        if (!service)
          throw new AppError(404, 'BUSINESS_SERVICE_NOT_FOUND', 'Business service not found');
        const activeAssetsCount = await tx.assets.count({
          where: { business_service_id: serviceId, status: 'ACTIVE' },
        });
        const unresolvedRisksCount = await tx.risks.count({
          where: { business_service_id: serviceId, status: { notIn: ['CLOSED', 'ARCHIVED'] } },
        });
        return { service, activeAssetsCount, unresolvedRisksCount };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  },
  deactivate(userId: string, serviceId: string, input: DeactivateBusinessServiceInput) {
    return prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR SHARE`;
          const actor = await tx.users.findUnique({
            where: { id: userId },
            select: { role: true, status: true },
          });
          if (!actor || actor.status !== 'ACTIVE')
            throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
          if (actor.role !== 'SECURITY_OFFICER')
            throw new AppError(403, 'FORBIDDEN', 'Security Officer access required');
          await tx.$queryRaw`SELECT id FROM business_services WHERE id = ${serviceId}::uuid FOR UPDATE`;
          const current = await tx.business_services.findUnique({
            where: { id: serviceId },
            select: serviceSelect,
          });
          if (!current)
            throw new AppError(404, 'BUSINESS_SERVICE_NOT_FOUND', 'Business service not found');
          if (current.status !== 'ACTIVE')
            throw new AppError(
              409,
              'BUSINESS_SERVICE_INACTIVE',
              'This service is already inactive. Reload the list.',
            );
          if (current.updated_at.toISOString() !== new Date(input.expectedUpdatedAt).toISOString())
            throw new AppError(
              409,
              'BUSINESS_SERVICE_STALE',
              'This service has changed. Reload and review before deactivating.',
            );
          if (input.confirmationName !== current.name.trim().replace(/\s+/g, ' '))
            throw new AppError(
              422,
              'BUSINESS_SERVICE_CONFIRMATION_MISMATCH',
              'Enter the current service name to confirm.',
            );
          // Predicate reads + Serializable prevent a concurrent Asset link or Risk
          // creation from bypassing this retirement guard. Existing writers already
          // validate Active service status inside Serializable transactions.
          const activeAssetsCount = await tx.assets.count({
            where: { business_service_id: serviceId, status: 'ACTIVE' },
          });
          const unresolvedRisksCount = await tx.risks.count({
            where: { business_service_id: serviceId, status: { notIn: ['CLOSED', 'ARCHIVED'] } },
          });
          if (activeAssetsCount || unresolvedRisksCount)
            throw new AppError(
              409,
              'BUSINESS_SERVICE_IN_USE',
              'Reassign or unlink active assets and resolve directly scoped risks before deactivating. Accepted risks remain under management until Closed or Archived.',
              { activeAssetsCount, unresolvedRisksCount },
            );
          const service = await tx.business_services.update({
            where: { id: serviceId },
            data: { status: 'INACTIVE' },
            select: serviceSelect,
          });
          const id = randomUUID();
          const before = { status: current.status };
          const after = { status: service.status, reason: input.reason };
          await tx.audit_logs.create({
            data: {
              id,
              actor_type: 'USER',
              actor_user_id: userId,
              action: 'BUSINESS_SERVICE_DEACTIVATED',
              resource_type: 'BUSINESS_SERVICE',
              resource_id: serviceId,
              source: 'API',
              before_data: before,
              after_data: after,
              record_hash: createHash('sha256')
                .update(JSON.stringify({ id, actor: userId, serviceId, before, after }))
                .digest('hex'),
            },
            select: { id: true },
          });
          return service;
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 },
      )
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
          throw new AppError(
            409,
            'BUSINESS_SERVICE_STALE',
            'Service usage changed concurrently. Reload and review before deactivating.',
          );
        throw error;
      });
  },
  update(userId: string, serviceId: string, input: UpdateBusinessServiceInput) {
    return prisma.$transaction(
      async (tx) => {
        // Same lock as Create: renames and creations share the name guard.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(738201, 1)::text AS locked`;
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid OR id = ${input.ownerUserId ?? null}::uuid ORDER BY id FOR SHARE`;
        const actor = await tx.users.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        });
        if (!actor || actor.status !== 'ACTIVE')
          throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
        if (actor.role !== 'SECURITY_OFFICER')
          throw new AppError(403, 'FORBIDDEN', 'Security Officer access required');
        await tx.$queryRaw`SELECT id FROM business_services WHERE id = ${serviceId}::uuid FOR UPDATE`;
        const current = await tx.business_services.findUnique({
          where: { id: serviceId },
          select: { ...serviceSelect, owner_user_id: true },
        });
        if (!current)
          throw new AppError(404, 'BUSINESS_SERVICE_NOT_FOUND', 'Business service not found');
        if (current.status !== 'ACTIVE')
          throw new AppError(
            409,
            'BUSINESS_SERVICE_INACTIVE',
            'Inactive business services are read-only.',
          );
        if (current.updated_at.toISOString() !== new Date(input.expectedUpdatedAt).toISOString())
          throw new AppError(
            409,
            'BUSINESS_SERVICE_STALE',
            'This service has changed. Reload the latest data before editing.',
          );
        const name = input.name ?? current.name;
        const description =
          input.description === undefined ? current.description : input.description || null;
        const ownerId = input.ownerUserId === undefined ? current.owner_user_id : input.ownerUserId;
        // Unchanged inactive owner may be retained; new owners must be active.
        if (
          ownerId &&
          ownerId !== current.owner_user_id &&
          !(await tx.users.findFirst({
            where: { id: ownerId, status: 'ACTIVE' },
            select: { id: true },
          }))
        )
          throw new AppError(422, 'INVALID_SERVICE_OWNER', 'New responsible owner must be active.');
        if (
          name === current.name &&
          description === current.description &&
          ownerId === current.owner_user_id
        )
          return current;
        if (name !== current.name) {
          const duplicate = await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM business_services WHERE id <> ${serviceId}::uuid AND lower(regexp_replace(trim(name), '[[:space:]]+', ' ', 'g')) = lower(${name}) LIMIT 1`;
          if (duplicate.length)
            throw new AppError(
              409,
              'BUSINESS_SERVICE_NAME_EXISTS',
              'A business service with this name already exists, including inactive services.',
            );
        }
        const item = await tx.business_services.update({
          where: { id: serviceId },
          data: { name, description, owner_user_id: ownerId },
          select: serviceSelect,
        });
        const id = randomUUID();
        const before = {
          name: current.name,
          description: current.description,
          ownerUserId: current.owner_user_id,
        };
        const after = { name, description, ownerUserId: ownerId };
        await tx.audit_logs.create({
          data: {
            id,
            actor_type: 'USER',
            actor_user_id: userId,
            action: 'BUSINESS_SERVICE_UPDATED',
            resource_type: 'BUSINESS_SERVICE',
            resource_id: serviceId,
            source: 'API',
            before_data: before,
            after_data: after,
            record_hash: createHash('sha256')
              .update(JSON.stringify({ id, actor: userId, serviceId, before, after }))
              .digest('hex'),
          },
          select: { id: true },
        });
        return item;
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 },
    );
  },
  ownerOptions(q?: string) {
    return prisma.users.findMany({
      where: {
        status: 'ACTIVE',
        ...(q ? { full_name: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: { id: true, full_name: true, role: true },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
      take: 10,
    });
  },
  create(userId: string, input: CreateBusinessServiceInput) {
    return prisma.$transaction(
      async (tx) => {
        // Serialize this creation path so concurrent double submits cannot both
        // pass the name check. No schema change or rewrite of existing records.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(738201, 1)::text AS locked`;
        const ownerId = input.ownerUserId ?? null;
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid OR id = ${ownerId}::uuid ORDER BY id FOR SHARE`;
        const actor = await tx.users.findUnique({
          where: { id: userId },
          select: { role: true, status: true },
        });
        if (!actor || actor.status !== 'ACTIVE')
          throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
        if (actor.role !== 'SECURITY_OFFICER')
          throw new AppError(403, 'FORBIDDEN', 'Security Officer access required');
        if (
          ownerId &&
          !(await tx.users.findFirst({
            where: { id: ownerId, status: 'ACTIVE' },
            select: { id: true },
          }))
        ) {
          throw new AppError(
            422,
            'INVALID_SERVICE_OWNER',
            'Selected owner is no longer active. Choose another owner or leave unassigned.',
          );
        }
        const duplicate = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM business_services WHERE lower(regexp_replace(trim(name), '[[:space:]]+', ' ', 'g')) = lower(${input.name}) LIMIT 1`;
        if (duplicate.length)
          throw new AppError(
            409,
            'BUSINESS_SERVICE_NAME_EXISTS',
            'A business service with this name already exists, including inactive services. Choose a different name.',
          );
        const item = await tx.business_services.create({
          data: {
            name: input.name,
            description: input.description || null,
            owner_user_id: ownerId,
            status: 'ACTIVE',
          },
          select: serviceSelect,
        });
        const id = randomUUID();
        const after = { name: item.name, status: item.status, ownerUserId: ownerId };
        await tx.audit_logs.create({
          data: {
            id,
            actor_type: 'USER',
            actor_user_id: userId,
            action: 'BUSINESS_SERVICE_CREATED',
            resource_type: 'BUSINESS_SERVICE',
            resource_id: item.id,
            source: 'API',
            after_data: after,
            record_hash: createHash('sha256')
              .update(JSON.stringify({ id, actor: userId, serviceId: item.id, after }))
              .digest('hex'),
          },
          select: { id: true },
        });
        return item;
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 },
    );
  },
  findActor(userId: string) {
    return prisma.users.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  },
  list(query: ListBusinessServicesQuery) {
    const where: Prisma.business_servicesWhereInput = {
      ...(query.status ? { status: query.status.toUpperCase() } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              { users: { full_name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    return prisma.$transaction(
      [
        prisma.business_services.count({ where }),
        prisma.business_services.findMany({
          where,
          select: serviceSelect,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
  },
  findById(serviceId: string) {
    return prisma.business_services.findUnique({ where: { id: serviceId }, select: serviceSelect });
  },
  listAssets(serviceId: string, query: ServicePageQuery) {
    const where = { business_service_id: serviceId };
    return prisma.$transaction(
      [
        prisma.assets.count({ where }),
        prisma.assets.findMany({
          where,
          select: {
            id: true,
            asset_code: true,
            name: true,
            asset_type: true,
            status: true,
          },
          orderBy: [{ asset_code: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
  },
};
