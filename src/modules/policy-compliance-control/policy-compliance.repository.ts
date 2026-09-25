import type { Prisma, policy_version_status } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ReviewablePolicyDraftQuery } from './dto/view-policy-draft.dto.js';

export const submittedPolicyVersionStatuses: policy_version_status[] = [
  'IN_REVIEW',
  'WAITING_APPROVAL',
];

const reviewablePolicySelect = {
  id: true,
  policy_code: true,
  title: true,
  description: true,
  owner_user_id: true,
  status: true,
  updated_at: true,
  policy_versions_policy_versions_policy_idTopolicies: {
    where: { status: { in: submittedPolicyVersionStatuses } },
    orderBy: { created_at: 'desc' as const },
    take: 1,
    select: {
      id: true,
      version_number: true,
      status: true,
      author_user_id: true,
      created_at: true,
    },
  },
} as const;

const policyReviewSelect = {
  id: true,
  policy_id: true,
  version_number: true,
  content: true,
  change_summary: true,
  status: true,
  author_user_id: true,
  created_at: true,
  policies_policy_versions_policy_idTopolicies: {
    select: {
      policy_code: true,
      title: true,
      description: true,
      owner_user_id: true,
      status: true,
      updated_at: true,
    },
  },
} as const;

export type ReviewablePolicyRecord = Prisma.policiesGetPayload<{
  select: typeof reviewablePolicySelect;
}>;
export type PolicyReviewRecord = Prisma.policy_versionsGetPayload<{
  select: typeof policyReviewSelect;
}>;

export const policyComplianceRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  listReviewableDrafts(query: ReviewablePolicyDraftQuery) {
    const where: Prisma.policiesWhereInput = {
      status: 'DRAFT',
      policy_versions_policy_versions_policy_idTopolicies: {
        some: { status: { in: [...submittedPolicyVersionStatuses] } },
      },
      ...(query.q
        ? {
            OR: [
              { policy_code: { contains: query.q, mode: 'insensitive' as const } },
              { title: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.policiesOrderByWithRelationInput =
      query.sortBy === 'policyCode'
        ? { policy_code: query.sortOrder }
        : query.sortBy === 'title'
          ? { title: query.sortOrder }
          : { updated_at: query.sortOrder };
    return prisma.$transaction([
      prisma.policies.count({ where }),
      prisma.policies.findMany({
        where,
        select: reviewablePolicySelect,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },

  findReviewableDraft(policyId: string, versionId: string) {
    return prisma.policy_versions.findFirst({
      where: {
        id: versionId,
        policy_id: policyId,
        status: { in: [...submittedPolicyVersionStatuses] },
        policies_policy_versions_policy_idTopolicies: { status: 'DRAFT' },
      },
      select: policyReviewSelect,
    });
  },
};
