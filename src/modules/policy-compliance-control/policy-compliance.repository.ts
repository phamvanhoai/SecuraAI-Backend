import type { Prisma, policy_version_status } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ReviewablePolicyDraftQuery } from './dto/view-policy-draft.dto.js';
import type { ListPolicyDraftsQuery } from './dto/list-policy-drafts.dto.js';
import type { RequestPolicyRevisionBody } from './dto/request-policy-revision.dto.js';

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

const ownedPolicyDraftSelect = {
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
      created_at: true,
      updated_at: true,
    },
  },
} satisfies Prisma.policy_versionsSelect;

const draftForSubmissionSelect = {
  id: true,
  policy_id: true,
  version_number: true,
  status: true,
  author_user_id: true,
  created_at: true,
  policies_policy_versions_policy_idTopolicies: {
    select: {
      id: true,
      policy_code: true,
      title: true,
      owner_user_id: true,
      status: true,
      updated_at: true,
    },
  },
} satisfies Prisma.policy_versionsSelect;

export type ReviewablePolicyRecord = Prisma.policiesGetPayload<{
  select: typeof reviewablePolicySelect;
}>;
export type PolicyReviewRecord = Prisma.policy_versionsGetPayload<{
  select: typeof policyReviewSelect;
}>;
export type OwnedPolicyDraftRecord = Prisma.policy_versionsGetPayload<{
  select: typeof ownedPolicyDraftSelect;
}>;
export type PolicyDraftForSubmission = Prisma.policy_versionsGetPayload<{
  select: typeof draftForSubmissionSelect;
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

  requestDraftRevision(
    policyId: string,
    versionId: string,
    actorUserId: string,
    input: RequestPolicyRevisionBody,
  ) {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.policy_versions.updateMany({
        where: {
          id: versionId,
          policy_id: policyId,
          status: { in: [...submittedPolicyVersionStatuses] },
          policies_policy_versions_policy_idTopolicies: { status: 'DRAFT' },
        },
        data: { status: 'DRAFT' },
      });
      if (updated.count !== 1) return null;

      const decision = await transaction.policy_decisions.create({
        data: {
          policy_version_id: versionId,
          action: 'REVISION_REQUESTED',
          actor_user_id: actorUserId,
          comment: input.comment,
        },
        select: {
          id: true,
          action: true,
          actor_user_id: true,
          comment: true,
          decided_at: true,
        },
      });
      await transaction.policies.update({
        where: { id: policyId },
        data: { updated_at: new Date() },
      });
      const version = await transaction.policy_versions.findUniqueOrThrow({
        where: { id: versionId },
        select: policyReviewSelect,
      });
      return { version, decision };
    });
  },

  listOwnDrafts(userId: string, query: ListPolicyDraftsQuery) {
    const where: Prisma.policy_versionsWhereInput = {
      status: 'DRAFT',
      author_user_id: userId,
      policies_policy_versions_policy_idTopolicies: {
        owner_user_id: userId,
        status: 'DRAFT',
        ...(query.q
          ? { OR: [
              { policy_code: { contains: query.q, mode: 'insensitive' as const } },
              { title: { contains: query.q, mode: 'insensitive' as const } },
            ] }
          : {}),
      },
    };
    return prisma.$transaction([
      prisma.policy_versions.count({ where }),
      prisma.policy_versions.findMany({
        where,
        select: ownedPolicyDraftSelect,
        orderBy: [
          { policies_policy_versions_policy_idTopolicies: { updated_at: query.sortOrder } },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },

  findDraftForSubmission(policyId: string, versionId: string) {
    return prisma.policy_versions.findFirst({
      where: { id: versionId, policy_id: policyId },
      select: draftForSubmissionSelect,
    });
  },

  submitDraft(policyId: string, versionId: string, actorUserId: string) {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.policy_versions.updateMany({
        where: {
          id: versionId,
          policy_id: policyId,
          status: 'DRAFT',
          OR: [
            { author_user_id: actorUserId },
            { policies_policy_versions_policy_idTopolicies: { owner_user_id: actorUserId } },
          ],
        },
        data: { status: 'IN_REVIEW' },
      });
      if (updated.count !== 1) return null;
      await transaction.policies.update({ where: { id: policyId }, data: { updated_at: new Date() } });
      return transaction.policy_versions.findUniqueOrThrow({
        where: { id: versionId },
        select: draftForSubmissionSelect,
      });
    });
  },
};
