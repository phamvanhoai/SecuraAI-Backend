import type { PolicyDraftRecord } from './policy-compliance.repository.js';

export type PolicyDraftResponse = {
  id: string;
  policyCode: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  status: string;
  currentVersion: {
    id: string;
    versionNumber: string;
    content: string;
    status: string;
    createdAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
};

export function mapPolicyDraft(policy: PolicyDraftRecord): PolicyDraftResponse {
  const currentVersion = policy.policy_versions[0];
  if (!currentVersion) {
    throw new Error('Newly created policy draft has no policy version');
  }

  return {
    id: policy.policy_id,
    policyCode: policy.policy_code,
    title: policy.title,
    description: policy.description,
    ownerUserId: policy.owner_user_id,
    status: policy.status,
    currentVersion: {
      id: currentVersion.policy_version_id,
      versionNumber: currentVersion.version_number,
      content: currentVersion.content,
      status: currentVersion.status,
      createdAt: currentVersion.created_at,
    },
    createdAt: policy.created_at,
    updatedAt: policy.updated_at,
  };
}
