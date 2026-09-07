import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { AppError } from '../../common/errors/app-error.js';
import { toAssetDetail, toAssetListItem } from './asset-management.mapper.js';
import { assetManagementRepository } from './asset-management.repository.js';
import type { CreateAssetBody } from './dto/create-asset.dto.js';
import type { ListAssetsQuery } from './dto/list-assets-query.dto.js';
import type { UpdateAssetBody } from './dto/update-asset.dto.js';
import type { AssetUpdateChanges } from './asset-management.repository.js';

type AssetListActor = {
  userId: string;
  permissions: readonly string[];
};

type CreateAssetContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

const allowedStatusTransitions: Readonly<Record<string, readonly string[]>> = {
  active: ['inactive', 'retired', 'disposed'],
  inactive: ['active', 'retired', 'disposed'],
  retired: ['active', 'disposed'],
  disposed: [],
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

  async update(
    assetId: string,
    input: UpdateAssetBody,
    actor: AssetListActor,
    context: CreateAssetContext,
  ) {
    if (!actor.permissions.includes('assets.update')) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }

    const current = await assetManagementRepository.findById(assetId);
    if (!current) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset was not found');
    if (current.status === 'disposed') {
      throw new AppError(422, 'ASSET_DISPOSED', 'A disposed asset cannot be updated');
    }

    if (input.status !== undefined && input.status !== current.status) {
      const allowed = allowedStatusTransitions[current.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new AppError(
          422,
          'INVALID_STATUS_TRANSITION',
          'Asset status transition is not allowed',
        );
      }
    }

    if (input.departmentId !== undefined && input.departmentId !== null) {
      const department = await assetManagementRepository.findDepartmentById(input.departmentId);
      if (!department) {
        throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department was not found');
      }
      if (department.status !== 'active') {
        throw new AppError(422, 'DEPARTMENT_INACTIVE', 'Department is not active');
      }
    }

    if (input.ownerUserId !== undefined && input.ownerUserId !== null) {
      const owner = await assetManagementRepository.findOwnerById(input.ownerUserId);
      if (!owner) throw new AppError(404, 'ASSET_OWNER_NOT_FOUND', 'Asset owner was not found');
      if (owner.status !== 'active') {
        throw new AppError(422, 'ASSET_OWNER_INACTIVE', 'Asset owner is not active');
      }
    }

    const changes: AssetUpdateChanges = {
      ...(input.name !== undefined && input.name !== current.name && { name: input.name }),
      ...(input.assetType !== undefined &&
        input.assetType !== current.asset_type && { assetType: input.assetType }),
      ...(input.description !== undefined &&
        input.description !== current.description && { description: input.description }),
      ...(input.departmentId !== undefined &&
        input.departmentId !== current.department_id && { departmentId: input.departmentId }),
      ...(input.ownerUserId !== undefined &&
        input.ownerUserId !== current.owner_user_id && { ownerUserId: input.ownerUserId }),
      ...(input.criticality !== undefined &&
        input.criticality !== current.criticality && { criticality: input.criticality }),
      ...(input.hostname !== undefined &&
        input.hostname !== current.hostname && { hostname: input.hostname }),
      ...(input.ipAddress !== undefined &&
        input.ipAddress !== current.ip_address && { ipAddress: input.ipAddress }),
      ...(input.location !== undefined &&
        input.location !== current.location && { location: input.location }),
      ...(input.status !== undefined &&
        input.status !== current.status && { status: input.status }),
      ...(input.metadata !== undefined &&
        !isDeepStrictEqual(input.metadata, current.metadata) && { metadata: input.metadata }),
    };

    if (changes.status === 'retired') changes.retiredAt = new Date();
    else if (changes.status === 'active' && current.status === 'retired') changes.retiredAt = null;

    if (Object.keys(changes).length === 0) return toAssetDetail(current);

    const beforeData: Record<string, Prisma.JsonValue> = {};
    const afterData: Record<string, Prisma.JsonValue> = {};
    const recordChange = (key: string, before: Prisma.JsonValue, after: Prisma.JsonValue) => {
      beforeData[key] = before;
      afterData[key] = after;
    };

    if (changes.name !== undefined) recordChange('name', current.name, changes.name);
    if (changes.assetType !== undefined)
      recordChange('assetType', current.asset_type, changes.assetType);
    if (changes.description !== undefined)
      recordChange('description', current.description, changes.description);
    if (changes.departmentId !== undefined)
      recordChange('departmentId', current.department_id, changes.departmentId);
    if (changes.ownerUserId !== undefined)
      recordChange('ownerUserId', current.owner_user_id, changes.ownerUserId);
    if (changes.criticality !== undefined)
      recordChange('criticality', current.criticality, changes.criticality);
    if (changes.hostname !== undefined)
      recordChange('hostname', current.hostname, changes.hostname);
    if (changes.ipAddress !== undefined)
      recordChange('ipAddress', current.ip_address, changes.ipAddress);
    if (changes.location !== undefined)
      recordChange('location', current.location, changes.location);
    if (changes.status !== undefined) recordChange('status', current.status, changes.status);
    if (changes.metadata !== undefined)
      recordChange('metadata', current.metadata ?? null, changes.metadata);
    if (changes.retiredAt !== undefined)
      recordChange(
        'retiredAt',
        current.retired_at?.toISOString() ?? null,
        changes.retiredAt?.toISOString() ?? null,
      );

    const updated = await assetManagementRepository.update(assetId, changes, {
      actorUserId: actor.userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      beforeData,
      afterData,
    });
    return toAssetDetail(updated);
  },

  async delete(assetId: string, actor: AssetListActor, context: CreateAssetContext): Promise<void> {
    if (!actor.permissions.includes('assets.delete')) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }

    const result = await assetManagementRepository.softDelete(assetId, {
      actorUserId: actor.userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    if (result.kind === 'not_found') {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset was not found');
    }
    if (result.kind === 'blocked') {
      throw new AppError(
        409,
        'ASSET_HAS_ACTIVE_DEPENDENCIES',
        'Asset is being used by active business records',
        result.dependencies,
      );
    }
  },
};
