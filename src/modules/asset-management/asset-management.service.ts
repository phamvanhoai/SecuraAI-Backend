import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { AppError } from '../../common/errors/app-error.js';
import { toAssetDetail, toAssetListItem } from './asset-management.mapper.js';
import { assetManagementRepository } from './asset-management.repository.js';
import type { CreateAssetBody } from './dto/create-asset.dto.js';
import type { ClassifyAssetCriticalityBody } from './dto/classify-asset-criticality.dto.js';
import type { AssignAssetOwnerBody } from './dto/assign-asset-owner.dto.js';
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

const criticalityFromScore = (score: number): 'low' | 'medium' | 'high' | 'critical' => {
  if (score < 2) return 'low';
  if (score < 3) return 'medium';
  if (score < 4) return 'high';
  return 'critical';
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

    const changes: AssetUpdateChanges = {
      ...(input.name !== undefined && input.name !== current.name && { name: input.name }),
      ...(input.assetType !== undefined &&
        input.assetType !== current.asset_type && { assetType: input.assetType }),
      ...(input.description !== undefined &&
        input.description !== current.description && { description: input.description }),
      ...(input.departmentId !== undefined &&
        input.departmentId !== current.department_id && { departmentId: input.departmentId }),
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

  async classifyCriticality(
    assetId: string,
    input: ClassifyAssetCriticalityBody,
    actor: AssetListActor,
    context: CreateAssetContext,
  ) {
    if (!actor.permissions.includes('assets.classify')) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }

    const asset = await assetManagementRepository.findById(assetId);
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset was not found');
    if (asset.status === 'disposed') {
      throw new AppError(422, 'ASSET_DISPOSED', 'A disposed asset cannot be classified');
    }

    const rawScore =
      input.confidentialityImpact * 0.25 +
      input.integrityImpact * 0.25 +
      input.availabilityImpact * 0.3 +
      input.businessImpact * 0.2;
    const score = Math.round((rawScore + Number.EPSILON) * 100) / 100;
    const criticality = criticalityFromScore(score);
    const classifiedAt = new Date();
    const changed = criticality !== asset.criticality;
    await assetManagementRepository.classifyCriticality(
      assetId,
      {
        previousCriticality: asset.criticality,
        criticality,
        score,
        changed,
        classifiedAt,
        criteria: {
          confidentialityImpact: input.confidentialityImpact,
          integrityImpact: input.integrityImpact,
          availabilityImpact: input.availabilityImpact,
          businessImpact: input.businessImpact,
        },
        reason: input.reason,
      },
      {
        actorUserId: actor.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    );

    return {
      assetId,
      previousCriticality: asset.criticality,
      criticality,
      score,
      changed,
      classifiedAt,
    };
  },

  async assignOwner(
    assetId: string,
    input: AssignAssetOwnerBody,
    actor: AssetListActor,
    context: CreateAssetContext,
  ) {
    if (!actor.permissions.includes('assets.assign-owner')) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }

    const asset = await assetManagementRepository.findById(assetId);
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset was not found');
    if (asset.status === 'disposed') {
      throw new AppError(422, 'ASSET_DISPOSED', 'A disposed asset cannot be assigned an owner');
    }

    let nextOwner: { user_id: string; full_name: string } | null = null;
    if (input.ownerUserId !== null) {
      const owner = await assetManagementRepository.findOwnerById(input.ownerUserId);
      if (!owner) throw new AppError(404, 'ASSET_OWNER_NOT_FOUND', 'Asset owner was not found');
      if (owner.status !== 'active') {
        throw new AppError(422, 'ASSET_OWNER_INACTIVE', 'Asset owner is not active');
      }
      nextOwner = owner;
    }

    const previousOwner = asset.users_assets_owner_user_idTousers
      ? {
          id: asset.users_assets_owner_user_idTousers.user_id,
          fullName: asset.users_assets_owner_user_idTousers.full_name,
        }
      : null;
    if (input.ownerUserId === asset.owner_user_id) {
      return {
        assetId,
        previousOwner,
        owner: previousOwner,
        changed: false,
        assignedAt: null,
      };
    }

    const action =
      asset.owner_user_id === null
        ? 'owner_assigned'
        : input.ownerUserId === null
          ? 'owner_unassigned'
          : 'owner_reassigned';
    const assignedAt = new Date();
    try {
      const updated = await assetManagementRepository.assignOwner(
        assetId,
        {
          ownerUserId: input.ownerUserId,
          reason: input.reason,
          previousOwnerId: asset.owner_user_id,
          action,
          assignedAt,
        },
        {
          actorUserId: actor.userId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      );
      const owner = updated.users_assets_owner_user_idTousers
        ? {
            id: updated.users_assets_owner_user_idTousers.user_id,
            fullName: updated.users_assets_owner_user_idTousers.full_name,
          }
        : nextOwner
          ? { id: nextOwner.user_id, fullName: nextOwner.full_name }
          : null;
      return { assetId, previousOwner, owner, changed: true, assignedAt };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new AppError(
          409,
          'ASSET_OWNER_ASSIGNMENT_CONFLICT',
          'Asset owner changed concurrently; retry the request',
        );
      }
      throw error;
    }
  },
};
