import { AppError } from '../../common/errors/app-error.js';
import type { ReviewablePolicyDraftQuery } from './dto/view-policy-draft.dto.js';
import type { ListPolicyDraftsQuery } from './dto/list-policy-drafts.dto.js';
import type { EditPolicyDraftBody } from './dto/edit-policy-draft.dto.js';
import { Prisma } from '@prisma/client';
import type { RequestPolicyRevisionBody } from './dto/request-policy-revision.dto.js';
import type { RejectPolicyBody, RejectedPolicyQuery } from './dto/reject-policy.dto.js';
import {
  policyComplianceRepository,
  type PolicyReviewRecord,
  type ReviewablePolicyRecord,
  type OwnedPolicyDraftRecord,
  type PolicyDraftForSubmission,
  type RejectedPolicyDecisionRecord,
} from './policy-compliance.repository.js';

function mapRejectedPolicy(decision: RejectedPolicyDecisionRecord) {
  const version = decision.policy_versions;
  const policy = version.policies_policy_versions_policy_idTopolicies;
  return {
    policyId: version.policy_id,
    policyCode: policy.policy_code,
    title: policy.title,
    ownerUserId: policy.owner_user_id,
    version: {
      id: version.id,
      versionNumber: version.version_number,
      status: version.status.toLowerCase(),
    },
    rejection: {
      id: decision.id,
      reason: decision.comment ?? '',
      rejectedByUserId: decision.actor_user_id,
      rejectedByName: decision.users.full_name,
      rejectedAt: decision.decided_at,
    },
  };
}

function toSubmittedDraft(version: PolicyDraftForSubmission) {
  const policy = version.policies_policy_versions_policy_idTopolicies;
  return {
    policyId: policy.id,
    policyCode: policy.policy_code,
    title: policy.title,
    policyStatus: policy.status,
    ownerUserId: policy.owner_user_id,
    version: {
      id: version.id,
      versionNumber: version.version_number,
      status: version.status,
      createdByUserId: version.author_user_id,
      createdAt: version.created_at,
    },
    submittedAt: policy.updated_at,
  };
}

function mapOwnedPolicyDraft(draft: OwnedPolicyDraftRecord) {
  const policy = draft.policies_policy_versions_policy_idTopolicies;
  return {
    policyId: draft.policy_id,
    policyCode: policy.policy_code,
    title: policy.title,
    description: policy.description,
    ownerUserId: policy.owner_user_id,
    policyStatus: policy.status,
    version: {
      id: draft.id,
      versionNumber: draft.version_number,
      content: draft.content,
      changeSummary: draft.change_summary,
      status: draft.status,
      createdByUserId: draft.author_user_id,
      createdAt: draft.created_at,
    },
    createdAt: policy.created_at,
    updatedAt: policy.updated_at,
  };
}

async function requireActiveAdmin(userId: string): Promise<void> {
  const actor = await policyComplianceRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (actor.role !== 'ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Admin role required');
  }
}

function mapReviewablePolicy(policy: ReviewablePolicyRecord) {
  const version = policy.policy_versions_policy_versions_policy_idTopolicies[0];
  if (!version) throw new Error('Reviewable policy has no submitted version');
  return {
    id: policy.id,
    policyCode: policy.policy_code,
    title: policy.title,
    description: policy.description,
    ownerUserId: policy.owner_user_id,
    status: policy.status.toLowerCase(),
    draftVersion: {
      id: version.id,
      versionNumber: version.version_number,
      status: version.status.toLowerCase(),
      createdByUserId: version.author_user_id,
      createdAt: version.created_at,
    },
    updatedAt: policy.updated_at,
  };
}

function mapPolicyReview(version: PolicyReviewRecord) {
  const policy = version.policies_policy_versions_policy_idTopolicies;
  return {
    policyId: version.policy_id,
    policyCode: policy.policy_code,
    title: policy.title,
    description: policy.description,
    ownerUserId: policy.owner_user_id,
    policyStatus: policy.status.toLowerCase(),
    updatedAt: policy.updated_at,
    version: {
      id: version.id,
      versionNumber: version.version_number,
      content: version.content,
      changeSummary: version.change_summary,
      status: version.status.toLowerCase(),
      effectiveDate: null,
      createdByUserId: version.author_user_id,
      createdAt: version.created_at,
    },
  };
}

export const policyComplianceService = {
  async listRejectedPolicies(userId: string, query: RejectedPolicyQuery) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    if (actor.role !== 'ADMIN' && actor.role !== 'SECURITY_OFFICER') {
      throw new AppError(403, 'FORBIDDEN', 'Admin or Security Officer role required');
    }
    const [total, decisions] = await policyComplianceRepository.listRejectedPolicies(
      query,
      actor.role === 'SECURITY_OFFICER' ? userId : undefined,
    );
    return {
      items: decisions.map(mapRejectedPolicy),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async rejectPolicy(
    userId: string,
    policyId: string,
    versionId: string,
    input: RejectPolicyBody,
  ) {
    await requireActiveAdmin(userId);
    const version = await policyComplianceRepository.findReviewableDraft(policyId, versionId);
    if (!version) {
      throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Submitted policy draft not found');
    }
    const result = await policyComplianceRepository.rejectDraft(
      policyId,
      versionId,
      userId,
      input,
    );
    if (!result) {
      throw new AppError(
        409,
        'POLICY_DRAFT_CHANGED',
        'The policy draft changed before it could be rejected',
      );
    }
    return {
      ...mapPolicyReview(result.version),
      decision: {
        id: result.decision.id,
        action: result.decision.action,
        comment: result.decision.comment ?? input.reason,
        actorUserId: result.decision.actor_user_id,
        decidedAt: result.decision.decided_at,
      },
    };
  },

  async approveForPublication(userId: string, policyId: string, versionId: string) {
    await requireActiveAdmin(userId);
    const version = await policyComplianceRepository.findReviewableDraft(policyId, versionId);
    if (!version) throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Submitted policy draft not found');
    const result = await policyComplianceRepository.approveDraftForPublication(policyId, versionId, userId);
    if (!result) throw new AppError(409, 'POLICY_DRAFT_CHANGED', 'The policy draft changed before it could be approved');
    return {
      ...mapPolicyReview(result.version),
      decision: { id: result.decision.id, action: result.decision.action, comment: result.decision.comment, actorUserId: result.decision.actor_user_id, decidedAt: result.decision.decided_at },
    };
  },

  async editOwnDraft(
    userId: string,
    policyId: string,
    versionId: string,
    input: EditPolicyDraftBody,
  ) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');

    const draft = await policyComplianceRepository.findDraftForEdit(policyId, versionId);
    if (!draft) throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Policy draft not found');
    const policy = draft.policies_policy_versions_policy_idTopolicies;
    if (draft.author_user_id !== userId || policy.owner_user_id !== userId)
      throw new AppError(403, 'FORBIDDEN', 'You can only edit policy drafts you own');
    if (policy.status !== 'DRAFT' || draft.status !== 'DRAFT')
      throw new AppError(
        409,
        'POLICY_DRAFT_NOT_EDITABLE',
        'Only a draft policy version can be edited',
      );

    try {
      const updated = await policyComplianceRepository.editDraft(
        policyId,
        versionId,
        userId,
        input,
      );
      if (!updated)
        throw new AppError(
          409,
          'POLICY_DRAFT_CHANGED',
          'The policy draft changed before it could be updated',
        );
      return mapOwnedPolicyDraft(updated);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(
          409,
          'POLICY_VERSION_CONFLICT',
          'This policy already has the requested version number',
        );
      }
      throw error;
    }
  },

  async requestRevision(
    userId: string,
    policyId: string,
    versionId: string,
    input: RequestPolicyRevisionBody,
  ) {
    await requireActiveAdmin(userId);
    const version = await policyComplianceRepository.findReviewableDraft(policyId, versionId);
    if (!version) {
      throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Submitted policy draft not found');
    }
    const result = await policyComplianceRepository.requestDraftRevision(
      policyId,
      versionId,
      userId,
      input,
    );
    if (!result) {
      throw new AppError(
        409,
        'POLICY_DRAFT_CHANGED',
        'The policy draft changed before revision could be requested',
      );
    }
    return {
      ...mapPolicyReview(result.version),
      decision: {
        id: result.decision.id,
        action: result.decision.action,
        comment: result.decision.comment ?? input.comment,
        actorUserId: result.decision.actor_user_id,
        decidedAt: result.decision.decided_at,
      },
    };
  },
  async submitForReview(userId: string, policyId: string, versionId: string) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const draft = await policyComplianceRepository.findDraftForSubmission(policyId, versionId);
    if (!draft) throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Policy draft not found');
    const policy = draft.policies_policy_versions_policy_idTopolicies;
    if (draft.author_user_id !== userId && policy.owner_user_id !== userId)
      throw new AppError(403, 'FORBIDDEN', 'You can only submit policy drafts you own');
    if (policy.status !== 'DRAFT' || draft.status !== 'DRAFT')
      throw new AppError(
        409,
        'POLICY_DRAFT_NOT_SUBMITTABLE',
        'Only an active draft policy version can be submitted for review',
      );
    const submitted = await policyComplianceRepository.submitDraft(policyId, versionId, userId);
    if (!submitted)
      throw new AppError(
        409,
        'POLICY_DRAFT_CHANGED',
        'The policy draft changed before it could be submitted',
      );
    return toSubmittedDraft(submitted);
  },
  async listOwnDrafts(userId: string, query: ListPolicyDraftsQuery) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const [total, drafts] = await policyComplianceRepository.listOwnDrafts(userId, query);
    return {
      items: drafts.map(mapOwnedPolicyDraft),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  async listReviewableDrafts(userId: string, query: ReviewablePolicyDraftQuery) {
    await requireActiveAdmin(userId);
    const [total, policies] = await policyComplianceRepository.listReviewableDrafts(query);
    return {
      items: policies.map(mapReviewablePolicy),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getReviewableDraft(userId: string, policyId: string, versionId: string) {
    await requireActiveAdmin(userId);
    const version = await policyComplianceRepository.findReviewableDraft(policyId, versionId);
    if (!version) {
      throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Submitted policy draft not found');
    }
    return mapPolicyReview(version);
  },
};
