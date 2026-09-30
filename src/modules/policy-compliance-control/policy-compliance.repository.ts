import type { Prisma, policy_version_status } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ReviewablePolicyDraftQuery } from './dto/view-policy-draft.dto.js';
import type { ListPolicyDraftsQuery } from './dto/list-policy-drafts.dto.js';
import type { EditPolicyDraftBody } from './dto/edit-policy-draft.dto.js';
import type { RequestPolicyRevisionBody } from './dto/request-policy-revision.dto.js';
import type { RejectPolicyBody, RejectedPolicyQuery } from './dto/reject-policy.dto.js';
import type { PublishedPolicyListQuery } from './dto/view-published-policy.dto.js';

const currentPublishedVersionSelect = {
  id: true,
  version_number: true,
  content: true,
  change_summary: true,
  status: true,
  author_user_id: true,
  created_at: true,
  published_at: true,
} satisfies Prisma.policy_versionsSelect;

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

const rejectedPolicyDecisionSelect = {
  id: true,
  comment: true,
  decided_at: true,
  actor_user_id: true,
  users: { select: { full_name: true } },
  policy_versions: {
    select: {
      id: true,
      version_number: true,
      status: true,
      policy_id: true,
      policies_policy_versions_policy_idTopolicies: {
        select: { policy_code: true, title: true, owner_user_id: true },
      },
    },
  },
} satisfies Prisma.policy_decisionsSelect;

export type RejectedPolicyDecisionRecord = Prisma.policy_decisionsGetPayload<{
  select: typeof rejectedPolicyDecisionSelect;
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

  approveDraftForPublication(policyId: string, versionId: string, actorUserId: string) {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.policy_versions.updateMany({
        where: { id: versionId, policy_id: policyId, status: { in: [...submittedPolicyVersionStatuses] }, policies_policy_versions_policy_idTopolicies: { status: 'DRAFT' } },
        data: { status: 'APPROVED' },
      });
      if (updated.count !== 1) return null;
      const decision = await transaction.policy_decisions.create({
        data: { policy_version_id: versionId, action: 'APPROVED', actor_user_id: actorUserId },
        select: { id: true, action: true, actor_user_id: true, comment: true, decided_at: true },
      });
      await transaction.policies.update({ where: { id: policyId }, data: { updated_at: new Date() } });
      const version = await transaction.policy_versions.findUniqueOrThrow({ where: { id: versionId }, select: policyReviewSelect });
      return { version, decision };
    });
  },

  listOwnedPublishedPolicies(userId: string) {
    return prisma.policies.findMany({
      where: {
        owner_user_id: userId,
        status: 'ACTIVE',
        current_published_version_id: { not: null },
      },
      select: {
        id: true,
        policy_code: true,
        title: true,
        description: true,
        updated_at: true,
        policy_versions_policies_current_published_version_idTopolicy_versions: {
          select: currentPublishedVersionSelect,
        },
        policy_versions_policy_versions_policy_idTopolicies: {
          where: { status: { in: ['DRAFT', 'IN_REVIEW', 'WAITING_APPROVAL', 'APPROVED'] } },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
    });
  },

  listPublishedPoliciesForEmployee(userId: string, query: PublishedPolicyListQuery) {
    const acknowledgementFilter: Prisma.Policy_acknowledgementsListRelationFilter =
      query.status === 'acknowledged'
        ? { some: { user_id: userId } }
        : query.status === 'pending'
          ? { none: { user_id: userId } }
          : {};
    const where: Prisma.policiesWhereInput = {
      status: 'ACTIVE',
      current_published_version_id: { not: null },
      ...(query.q
        ? {
            OR: [
              { policy_code: { contains: query.q, mode: 'insensitive' as const } },
              { title: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      policy_versions_policies_current_published_version_idTopolicy_versions: {
        status: 'PUBLISHED',
        policy_acknowledgements: acknowledgementFilter,
      },
    };
    const select = {
      id: true,
      policy_code: true,
      title: true,
      description: true,
      policy_versions_policies_current_published_version_idTopolicy_versions: {
        select: {
          ...currentPublishedVersionSelect,
          policy_acknowledgements: {
            where: { user_id: userId },
            select: { acknowledged_at: true },
            take: 1,
          },
        },
      },
    } satisfies Prisma.policiesSelect;
    return prisma.$transaction([
      prisma.policies.count({ where }),
      prisma.policies.findMany({
        where,
        select,
        orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },

  findPublishedPolicyForEmployee(policyId: string, versionId: string, userId: string) {
    return prisma.policy_versions.findFirst({
      where: {
        id: versionId,
        policy_id: policyId,
        status: 'PUBLISHED',
        policies_policies_current_published_version_idTopolicy_versions: {
          some: { id: policyId, status: 'ACTIVE' },
        },
      },
      select: {
        ...currentPublishedVersionSelect,
        policy_id: true,
        policies_policy_versions_policy_idTopolicies: {
          select: { policy_code: true, title: true, description: true },
        },
        policy_acknowledgements: {
          where: { user_id: userId },
          select: { acknowledged_at: true },
          take: 1,
        },
      },
    });
  },

  listRejectedPolicies(query: RejectedPolicyQuery, ownerUserId?: string) {
    const policyWhere: Prisma.policiesWhereInput = {
      ...(ownerUserId ? { owner_user_id: ownerUserId } : {}),
      ...(query.q
        ? {
            OR: [
              { policy_code: { contains: query.q, mode: 'insensitive' as const } },
              { title: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const where: Prisma.policy_decisionsWhereInput = {
      action: 'REJECTED',
      policy_versions: {
        status: 'REJECTED',
        policies_policy_versions_policy_idTopolicies: policyWhere,
      },
    };
    return prisma.$transaction([
      prisma.policy_decisions.count({ where }),
      prisma.policy_decisions.findMany({
        where,
        select: rejectedPolicyDecisionSelect,
        orderBy: [{ decided_at: query.sortOrder }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },

  rejectDraft(
    policyId: string,
    versionId: string,
    actorUserId: string,
    input: RejectPolicyBody,
  ) {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.policy_versions.updateMany({
        where: {
          id: versionId,
          policy_id: policyId,
          status: { in: [...submittedPolicyVersionStatuses] },
          policies_policy_versions_policy_idTopolicies: { status: 'DRAFT' },
        },
        data: { status: 'REJECTED' },
      });
      if (updated.count !== 1) return null;

      const decision = await transaction.policy_decisions.create({
        data: {
          policy_version_id: versionId,
          action: 'REJECTED',
          actor_user_id: actorUserId,
          comment: input.reason,
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
          ? {
              OR: [
                { policy_code: { contains: query.q, mode: 'insensitive' as const } },
                { title: { contains: query.q, mode: 'insensitive' as const } },
              ],
            }
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

  findDraftForEdit(policyId: string, versionId: string) {
    return prisma.policy_versions.findFirst({
      where: { id: versionId, policy_id: policyId },
      select: ownedPolicyDraftSelect,
    });
  },

  editDraft(policyId: string, versionId: string, actorUserId: string, input: EditPolicyDraftBody) {
    return prisma.$transaction(async (transaction) => {
      const versionUpdate = await transaction.policy_versions.updateMany({
        where: {
          id: versionId,
          policy_id: policyId,
          author_user_id: actorUserId,
          status: 'DRAFT',
          policies_policy_versions_policy_idTopolicies: {
            owner_user_id: actorUserId,
            status: 'DRAFT',
          },
        },
        data: {
          ...(input.versionNumber !== undefined && { version_number: input.versionNumber }),
          ...(input.content !== undefined && { content: input.content }),
          ...(input.changeSummary !== undefined && { change_summary: input.changeSummary }),
        },
      });
      if (versionUpdate.count !== 1) return null;

      await transaction.policies.update({
        where: { id: policyId },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description }),
          updated_at: new Date(),
        },
      });

      return transaction.policy_versions.findUniqueOrThrow({
        where: { id: versionId },
        select: ownedPolicyDraftSelect,
      });
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
      await transaction.policies.update({
        where: { id: policyId },
        data: { updated_at: new Date() },
      });
      return transaction.policy_versions.findUniqueOrThrow({
        where: { id: versionId },
        select: draftForSubmissionSelect,
      });
    });
  },
};
