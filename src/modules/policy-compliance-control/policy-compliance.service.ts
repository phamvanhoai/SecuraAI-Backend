import { AppError } from '../../common/errors/app-error.js';
import type { ListPolicyDraftsQuery } from './dto/list-policy-drafts.dto.js';
import {
  policyComplianceRepository,
  type OwnedPolicyDraftRecord,
} from './policy-compliance.repository.js';

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

export const policyComplianceService = {
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
};
