import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import type { CreatePolicyDraftInput } from './dto/create-policy-draft.dto.js';
import type { ListPublishablePoliciesQuery } from './dto/list-publishable-policies.dto.js';
import type { PublishPolicyVersionBody } from './dto/publish-policy-version.dto.js';
import type { UpdatePolicyCreateVersionInput } from './dto/update-policy-create-version.dto.js';
import {
  mapDraftPolicyVersionDetail,
  mapNewPolicyVersion,
  mapPolicyDraft,
  mapPublishablePolicy,
  mapOwnedPolicyDraft,
  toPublishedPolicyVersionResponse,
} from './policy-compliance.mapper.js';
import type {
  ListOwnPolicyDraftsQuery,
  UpdatePolicyDraftInput,
} from './dto/manage-policy-draft.dto.js';
import { policyComplianceRepository } from './policy-compliance.repository.js';

type Actor = { userId: string; permissions: readonly string[] };
type RequestContext = { ipAddress: string | null; userAgent: string | null };

const requirePublishPermission = (actor: Actor): void => {
  if (!actor.permissions.includes('policies.publish')) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
};

const requireDraftPermission = (actor: Actor): void => {
  if (!actor.permissions.includes('policies.create')) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
};

const requireUpdatePermission = (actor: Actor): void => {
  if (!actor.permissions.includes('policies.update')) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
};

const publicationConflict = (): AppError =>
  new AppError(
    409,
    'POLICY_VERSION_PUBLISH_CONFLICT',
    'Policy version changed while it was being published',
  );

export const policyComplianceService = {
  async listOwnedPublishedPoliciesForNewVersion(actor: Actor) {
    requireUpdatePermission(actor);
    const policies = await policyComplianceRepository.listOwnedPublishedPoliciesForNewVersion(
      actor.userId,
    );
    return policies.map((policy) => ({
      id: policy.policy_id,
      policyCode: policy.policy_code,
      title: policy.title,
      description: policy.description,
      currentVersion: policy.policy_versions[0]?.version_number ?? null,
      updatedAt: policy.updated_at.toISOString(),
    }));
  },

  async updatePolicyAndCreateVersion(
    policyId: string,
    input: UpdatePolicyCreateVersionInput,
    actor: Actor,
    context: RequestContext,
  ) {
    requireUpdatePermission(actor);
    try {
      const version = await policyComplianceRepository.transaction(async (database) => {
        const policy = await policyComplianceRepository.findPolicyForNewVersion(database, policyId);
        if (!policy || policy.owner_user_id !== actor.userId) {
          throw new AppError(404, 'POLICY_NOT_FOUND', 'Policy was not found');
        }
        if (policy.status === 'archived') {
          throw new AppError(409, 'POLICY_ARCHIVED', 'An archived policy cannot be updated');
        }
        if (policy.policy_versions.some((item) => item.status === 'draft')) {
          throw new AppError(
            409,
            'POLICY_DRAFT_VERSION_EXISTS',
            'Complete or publish the existing draft before creating another version',
          );
        }
        const publishedVersion = policy.policy_versions.find((item) => item.status === 'published');
        if (policy.status !== 'published' || !publishedVersion) {
          throw new AppError(
            409,
            'POLICY_NOT_PUBLISHED',
            'A new version can only be created from a published policy',
          );
        }

        const created = await policyComplianceRepository.createNewPolicyVersion(
          database,
          policyId,
          input,
          actor.userId,
          new Date(),
        );
        await policyComplianceRepository.createNewPolicyVersionAudit(database, {
          actorUserId: actor.userId,
          policyId,
          versionId: created.policy_version_id,
          previousVersionNumber: publishedVersion.version_number,
          versionNumber: created.version_number,
          changedPolicyFields: [
            ...(input.title !== undefined ? ['title'] : []),
            ...(input.description !== undefined ? ['description'] : []),
          ],
          ...context,
        });
        return created;
      });
      return mapNewPolicyVersion(version);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'POLICY_VERSION_EXISTS', 'Policy version number already exists');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new AppError(
          409,
          'POLICY_VERSION_CREATE_CONFLICT',
          'Policy changed while the new version was being created',
        );
      }
      throw error;
    }
  },

  async createPolicyDraft(input: CreatePolicyDraftInput, actor: Actor, context: RequestContext) {
    requireDraftPermission(actor);
    const existingPolicy = await policyComplianceRepository.findPolicyByCode(input.policyCode);
    if (existingPolicy) {
      throw new AppError(409, 'POLICY_CODE_EXISTS', 'A policy with this code already exists');
    }

    try {
      const policy = await prisma.$transaction(async (transaction) => {
        const createdPolicy = await policyComplianceRepository.createPolicyDraft(transaction, {
          policyCode: input.policyCode,
          title: input.title,
          ...(input.description !== undefined ? { description: input.description } : {}),
          versionNumber: input.versionNumber,
          content: input.content,
          actorUserId: actor.userId,
        });
        const currentVersion = createdPolicy.policy_versions[0];
        if (!currentVersion) {
          throw new Error('Newly created policy draft has no policy version');
        }

        await policyComplianceRepository.createPolicyDraftAudit(transaction, {
          actorUserId: actor.userId,
          policyId: createdPolicy.policy_id,
          policyCode: createdPolicy.policy_code,
          title: createdPolicy.title,
          versionNumber: currentVersion.version_number,
          ...context,
        });
        return createdPolicy;
      });

      return mapPolicyDraft(policy);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'POLICY_CODE_EXISTS', 'A policy with this code already exists');
      }
      throw error;
    }
  },

  async listPublishablePolicies(query: ListPublishablePoliciesQuery, actor: Actor) {
    requirePublishPermission(actor);
    const result = await policyComplianceRepository.listPublishablePolicies(query);
    return {
      items: result.items.map(mapPublishablePolicy),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },

  async listOwnDrafts(query: ListOwnPolicyDraftsQuery, actor: Actor) {
    requireDraftPermission(actor);
    const result = await policyComplianceRepository.listOwnDrafts(actor.userId, query);
    return {
      items: result.items.map(mapOwnedPolicyDraft),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },

  async getDraftPolicyVersion(policyId: string, versionId: string, actor: Actor) {
    requirePublishPermission(actor);
    const version = await policyComplianceRepository.getDraftPolicyVersion(policyId, versionId);
    if (!version) {
      throw new AppError(
        404,
        'DRAFT_POLICY_VERSION_NOT_FOUND',
        'Draft policy version was not found',
      );
    }
    return mapDraftPolicyVersionDetail(version);
  },

  async getOwnDraft(policyId: string, versionId: string, actor: Actor) {
    requireDraftPermission(actor);
    const draft = await policyComplianceRepository.findOwnDraft(
      prisma,
      policyId,
      versionId,
      actor.userId,
    );
    if (!draft) throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Policy draft was not found');
    return mapOwnedPolicyDraft(draft);
  },

  async updateOwnDraft(
    policyId: string,
    versionId: string,
    input: UpdatePolicyDraftInput,
    actor: Actor,
    context: RequestContext,
  ) {
    requireDraftPermission(actor);
    try {
      const draft = await policyComplianceRepository.transaction(async (database) => {
        const existing = await policyComplianceRepository.findOwnDraft(
          database,
          policyId,
          versionId,
          actor.userId,
        );
        if (!existing) {
          throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Policy draft was not found');
        }
        await policyComplianceRepository.updateOwnDraft(
          database,
          policyId,
          versionId,
          input,
          new Date(),
        );
        await policyComplianceRepository.createDraftUpdatedAudit(database, {
          actorUserId: actor.userId,
          versionId,
          changedFields: Object.keys(input),
          ...context,
        });
        const updated = await policyComplianceRepository.findOwnDraft(
          database,
          policyId,
          versionId,
          actor.userId,
        );
        if (!updated) throw new Error('Updated policy draft could not be loaded');
        return updated;
      });
      return mapOwnedPolicyDraft(draft);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'POLICY_VERSION_EXISTS', 'Policy version number already exists');
      }
      throw error;
    }
  },

  async publishVersion(
    policyId: string,
    versionId: string,
    input: PublishPolicyVersionBody,
    actor: Actor,
    requestContext: RequestContext,
  ) {
    requirePublishPermission(actor);
    const publishedAt = new Date();
    const effectiveDateText = input.effectiveDate ?? publishedAt.toISOString().slice(0, 10);
    const context = {
      actorUserId: actor.userId,
      ...requestContext,
      effectiveDate: new Date(`${effectiveDateText}T00:00:00.000Z`),
      effectiveDateText,
      publishedAt,
    };

    try {
      const record = await policyComplianceRepository.transaction(async (database) => {
        const version = await policyComplianceRepository.findPolicyVersion(
          database,
          policyId,
          versionId,
        );
        if (!version) {
          throw new AppError(404, 'POLICY_VERSION_NOT_FOUND', 'Policy version was not found');
        }
        if (version.policies.status === 'archived') {
          throw new AppError(409, 'POLICY_ARCHIVED', 'An archived policy cannot be published');
        }
        if (version.status === 'published') {
          throw new AppError(
            409,
            'POLICY_VERSION_ALREADY_PUBLISHED',
            'Policy version is already published',
          );
        }
        if (version.status !== 'draft') {
          throw new AppError(
            409,
            'POLICY_VERSION_NOT_PUBLISHABLE',
            'Only a draft policy version can be published',
          );
        }

        await policyComplianceRepository.archivePublishedVersions(database, policyId, versionId);
        const updated = await policyComplianceRepository.publishDraftVersion(
          database,
          policyId,
          versionId,
          context,
        );
        if (updated.count !== 1) throw publicationConflict();
        await policyComplianceRepository.markPolicyPublished(database, policyId, publishedAt);
        await policyComplianceRepository.createPublishAudit(
          database,
          { policyId, versionId, versionNumber: version.version_number },
          context,
        );
        return policyComplianceRepository.getPublishedVersion(database, policyId, versionId);
      });
      return toPublishedPolicyVersionResponse(record);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw publicationConflict();
      }
      throw error;
    }
  },
} as const;
