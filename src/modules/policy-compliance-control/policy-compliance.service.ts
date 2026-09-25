import { AppError } from '../../common/errors/app-error.js';
import type { ReviewablePolicyDraftQuery } from './dto/view-policy-draft.dto.js';
import {
  policyComplianceRepository,
  type PolicyReviewRecord,
  type ReviewablePolicyRecord,
} from './policy-compliance.repository.js';

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
