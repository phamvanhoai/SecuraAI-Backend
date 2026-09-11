import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import type { CreatePolicyDraftInput } from './dto/create-policy-draft.dto.js';
import type {
  ListOwnPolicyDraftsQuery,
  UpdatePolicyDraftInput,
} from './dto/manage-policy-draft.dto.js';
import type { PublishPolicyVersionBody } from './dto/publish-policy-version.dto.js';
import {
  mapOwnedPolicyDraft,
  mapPolicyDraft,
  toPublishedPolicyVersionResponse,
} from './policy-compliance.mapper.js';
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

const publicationConflict = (): AppError =>
  new AppError(
    409,
    'POLICY_VERSION_PUBLISH_CONFLICT',
    'Policy version changed while it was being published',
  );

export const policyComplianceService = {
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
