import { Prisma, type policy_version_status } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ReviewablePolicyDraftQuery } from './dto/view-policy-draft.dto.js';
import type { ListPolicyDraftsQuery } from './dto/list-policy-drafts.dto.js';
import type { EditPolicyDraftBody } from './dto/edit-policy-draft.dto.js';
import type { RequestPolicyRevisionBody } from './dto/request-policy-revision.dto.js';
import type { RejectPolicyBody, RejectedPolicyQuery } from './dto/reject-policy.dto.js';
import type { PublishedPolicyListQuery } from './dto/view-published-policy.dto.js';
import type { CreatePolicyDraftBody } from './dto/create-policy-draft.dto.js';
import type { PolicyVersionHistoryQuery } from './dto/policy-version-history.dto.js';

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
  'APPROVED',
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

const policyVersionHistorySelect = {
  id: true,
  policy_id: true,
  version_number: true,
  content: true,
  change_summary: true,
  status: true,
  created_at: true,
  published_at: true,
  users: { select: { id: true, full_name: true } },
  policies_policy_versions_policy_idTopolicies: {
    select: { policy_code: true, title: true, description: true },
  },
} satisfies Prisma.policy_versionsSelect;

export type PolicyVersionHistoryRecord = Prisma.policy_versionsGetPayload<{
  select: typeof policyVersionHistorySelect;
}>;

export const policyComplianceRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  createPolicyDraft(userId: string, input: CreatePolicyDraftBody) {
    return prisma.$transaction(async (transaction) => {
      const policy = await transaction.policies.create({
        data: {
          policy_code: input.policyCode,
          title: input.title,
          ...(input.description !== undefined ? { description: input.description } : {}),
          owner_user_id: userId,
          status: 'DRAFT',
        },
        select: {
          id: true,
          policy_code: true,
          title: true,
          description: true,
          owner_user_id: true,
          status: true,
          created_at: true,
          updated_at: true,
        },
      });
      const version = await transaction.policy_versions.create({
        data: {
          policy_id: policy.id,
          version_number: input.versionNumber,
          content: input.content,
          status: 'DRAFT',
          author_user_id: userId,
        },
        select: {
          id: true,
          version_number: true,
          content: true,
          status: true,
          created_at: true,
        },
      });
      return { policy, version };
    });
  },

  listReviewableDrafts(query: ReviewablePolicyDraftQuery) {
    const where: Prisma.policiesWhereInput = {
      status: { in: ['DRAFT', 'ACTIVE'] },
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
        policies_policy_versions_policy_idTopolicies: { status: { in: ['DRAFT', 'ACTIVE'] } },
      },
      select: policyReviewSelect,
    });
  },

  listPolicyVersionHistory(query: PolicyVersionHistoryQuery) {
    const statuses: policy_version_status[] =
      query.status === 'published'
        ? ['PUBLISHED']
        : query.status === 'archived'
          ? ['SUPERSEDED']
          : ['PUBLISHED', 'SUPERSEDED'];
    const where: Prisma.policy_versionsWhereInput = {
      status: { in: statuses },
      ...(query.q
        ? {
            policies_policy_versions_policy_idTopolicies: {
              OR: [
                { policy_code: { contains: query.q, mode: 'insensitive' as const } },
                { title: { contains: query.q, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };
    return prisma.$transaction([
      prisma.policy_versions.count({ where }),
      prisma.policy_versions.findMany({
        where,
        select: policyVersionHistorySelect,
        orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },

  findPolicyVersionHistory(policyId: string, versionId: string) {
    return prisma.policy_versions.findFirst({
      where: {
        id: versionId,
        policy_id: policyId,
        status: { in: ['PUBLISHED', 'SUPERSEDED'] },
      },
      select: policyVersionHistorySelect,
    });
  },

  reviewDraft(policyId: string, versionId: string, actorUserId: string) {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.policy_versions.updateMany({
        where: {
          id: versionId,
          policy_id: policyId,
          status: 'IN_REVIEW',
          policies_policy_versions_policy_idTopolicies: { status: 'DRAFT' },
        },
        data: { status: 'WAITING_APPROVAL' },
      });
      if (updated.count !== 1) return null;

      const decision = await transaction.policy_decisions.create({
        data: {
          policy_version_id: versionId,
          action: 'REVIEWED',
          actor_user_id: actorUserId,
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
        where: { id: versionId, policy_id: policyId, status: 'WAITING_APPROVAL', policies_policy_versions_policy_idTopolicies: { status: { in: ['DRAFT', 'ACTIVE'] } } },
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

  findPolicyVersionForPublication(policyId: string, versionId: string) {
    return prisma.policy_versions.findFirst({
      where: {
        id: versionId,
        policy_id: policyId,
        status: 'APPROVED',
        policies_policy_versions_policy_idTopolicies: { status: { in: ['DRAFT', 'ACTIVE'] } },
      },
      select: policyReviewSelect,
    });
  },

  publishApprovedVersion(policyId: string, versionId: string) {
    return prisma.$transaction(async (transaction) => {
      const policy = await transaction.policies.findFirst({
        where: { id: policyId, status: { in: ['DRAFT', 'ACTIVE'] } },
        select: { current_published_version_id: true },
      });
      if (!policy) return null;

      const publishedAt = new Date();
      const published = await transaction.policy_versions.updateMany({
        where: { id: versionId, policy_id: policyId, status: 'APPROVED' },
        data: { status: 'PUBLISHED', published_at: publishedAt },
      });
      if (published.count !== 1) return null;

      if (policy.current_published_version_id && policy.current_published_version_id !== versionId) {
        await transaction.policy_versions.updateMany({
          where: {
            id: policy.current_published_version_id,
            policy_id: policyId,
            status: 'PUBLISHED',
          },
          data: { status: 'SUPERSEDED' },
        });
      }

      await transaction.policies.update({
        where: { id: policyId },
        data: {
          status: 'ACTIVE',
          current_published_version_id: versionId,
          updated_at: publishedAt,
        },
      });

      return transaction.policy_versions.findUniqueOrThrow({
        where: { id: versionId },
        select: { ...policyReviewSelect, published_at: true },
      });
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

  async createPolicyAcknowledgement(versionId: string, userId: string) {
    const uniqueWhere = {
      policy_version_id_user_id: {
        policy_version_id: versionId,
        user_id: userId,
      },
    } as const;
    const existing = await prisma.policy_acknowledgements.findUnique({
      where: uniqueWhere,
      select: { acknowledged_at: true },
    });
    if (existing) return { ...existing, alreadyAcknowledged: true };

    try {
      const created = await prisma.policy_acknowledgements.create({
        data: { policy_version_id: versionId, user_id: userId },
        select: { acknowledged_at: true },
      });
      return { ...created, alreadyAcknowledged: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const acknowledgement = await prisma.policy_acknowledgements.findUniqueOrThrow({
        where: uniqueWhere,
        select: { acknowledged_at: true },
      });
      return { ...acknowledgement, alreadyAcknowledged: true };
    }
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
