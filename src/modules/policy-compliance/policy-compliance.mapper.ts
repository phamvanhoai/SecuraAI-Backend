import type {
  PolicyDraftRecord,
  PublishPolicyVersionRecord,
} from './policy-compliance.repository.js';

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

export type PublishedPolicyVersionResponse = {
  policyId: string;
  policyCode: string;
  title: string;
  status: string;
  publishedVersion: {
    id: string;
    versionNumber: string;
    status: string;
    effectiveDate: Date | null;
    publishedByUserId: string | null;
    publishedAt: Date | null;
    createdAt: Date;
  };
};

export const toPublishedPolicyVersionResponse = (
  record: PublishPolicyVersionRecord,
): PublishedPolicyVersionResponse => {
  const version = record.policy_versions[0];
  if (!version) throw new Error('Published policy version could not be loaded');
  return {
    policyId: record.policy_id,
    policyCode: record.policy_code,
    title: record.title,
    status: record.status,
    publishedVersion: {
      id: version.policy_version_id,
      versionNumber: version.version_number,
      status: version.status,
      effectiveDate: version.effective_date,
      publishedByUserId: version.published_by_user_id,
      publishedAt: version.published_at,
      createdAt: version.created_at,
    },
  };
};
