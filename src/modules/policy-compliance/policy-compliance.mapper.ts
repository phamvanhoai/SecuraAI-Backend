import type { PublishPolicyVersionRecord } from './policy-compliance.repository.js';

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
