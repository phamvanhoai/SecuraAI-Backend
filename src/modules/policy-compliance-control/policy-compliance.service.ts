import { AppError } from '../../common/errors/app-error.js';
import {
  policyComplianceRepository,
  type PolicyDraftForSubmission,
} from './policy-compliance.repository.js';

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

export const policyComplianceService = {
  async submitForReview(userId: string, policyId: string, versionId: string) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');

    const draft = await policyComplianceRepository.findDraftForSubmission(policyId, versionId);
    if (!draft)
      throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Policy draft not found');

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
};
