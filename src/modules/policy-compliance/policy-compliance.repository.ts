import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListPublishablePoliciesQuery } from './dto/list-publishable-policies.dto.js';
import type {
  ListOwnPolicyDraftsQuery,
  UpdatePolicyDraftInput,
} from './dto/manage-policy-draft.dto.js';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export const policyDraftSelect = {
  policy_id: true,
  policy_code: true,
  title: true,
  description: true,
  owner_user_id: true,
  status: true,
  created_at: true,
  updated_at: true,
  policy_versions: {
    select: {
      policy_version_id: true,
      version_number: true,
      content: true,
      status: true,
      created_at: true,
    },
    orderBy: { created_at: 'desc' },
    take: 1,
  },
} satisfies Prisma.policiesSelect;

export type PolicyDraftRecord = Prisma.policiesGetPayload<{
  select: typeof policyDraftSelect;
}>;

export const ownedPolicyDraftSelect = {
  policy_version_id: true,
  policy_id: true,
  version_number: true,
  content: true,
  change_summary: true,
  status: true,
  created_by_user_id: true,
  created_at: true,
  policies: {
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

export type OwnedPolicyDraftRecord = Prisma.policy_versionsGetPayload<{
  select: typeof ownedPolicyDraftSelect;
}>;

export const publishPolicyVersionSelect = {
  policy_id: true,
  policy_code: true,
  title: true,
  status: true,
  policy_versions: {
    select: {
      policy_version_id: true,
      version_number: true,
      status: true,
      effective_date: true,
      published_by_user_id: true,
      published_at: true,
      created_at: true,
    },
  },
} satisfies Prisma.policiesSelect;

export type PublishPolicyVersionRecord = Prisma.policiesGetPayload<{
  select: typeof publishPolicyVersionSelect;
}>;

export const publishablePolicySelect = {
  policy_id: true,
  policy_code: true,
  title: true,
  description: true,
  owner_user_id: true,
  status: true,
  updated_at: true,
  policy_versions: {
    where: { status: 'draft' },
    select: {
      policy_version_id: true,
      version_number: true,
      status: true,
      created_by_user_id: true,
      created_at: true,
    },
    orderBy: { created_at: 'desc' },
    take: 1,
  },
} satisfies Prisma.policiesSelect;

export type PublishablePolicyRecord = Prisma.policiesGetPayload<{
  select: typeof publishablePolicySelect;
}>;

export const draftPolicyVersionDetailSelect = {
  policy_version_id: true,
  policy_id: true,
  version_number: true,
  content: true,
  change_summary: true,
  status: true,
  effective_date: true,
  created_by_user_id: true,
  created_at: true,
  policies: {
    select: {
      policy_code: true,
      title: true,
      description: true,
      owner_user_id: true,
      status: true,
      updated_at: true,
    },
  },
} satisfies Prisma.policy_versionsSelect;

export type DraftPolicyVersionDetailRecord = Prisma.policy_versionsGetPayload<{
  select: typeof draftPolicyVersionDetailSelect;
}>;

export type PublishContext = {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
  effectiveDate: Date;
  effectiveDateText: string;
  publishedAt: Date;
};

type CreatePolicyDraftData = {
  policyCode: string;
  title: string;
  description?: string;
  versionNumber: string;
  content: string;
  actorUserId: string;
};

export const policyComplianceRepository = {
  transaction<T>(operation: (database: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  },

  findPolicyByCode(policyCode: string) {
    return prisma.policies.findUnique({
      where: { policy_code: policyCode },
      select: { policy_id: true },
    });
  },

  async listPublishablePolicies(
    query: ListPublishablePoliciesQuery,
  ): Promise<{ items: PublishablePolicyRecord[]; total: number }> {
    const where: Prisma.policiesWhereInput = {
      status: 'draft',
      policy_versions: { some: { status: 'draft' } },
      ...(query.q !== undefined && {
        OR: [
          { policy_code: { contains: query.q, mode: 'insensitive' } },
          { title: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const orderBy: Prisma.policiesOrderByWithRelationInput =
      query.sortBy === 'policyCode'
        ? { policy_code: query.sortOrder }
        : query.sortBy === 'title'
          ? { title: query.sortOrder }
          : { updated_at: query.sortOrder };
    const [total, items] = await prisma.$transaction([
      prisma.policies.count({ where }),
      prisma.policies.findMany({
        where,
        select: publishablePolicySelect,
        orderBy: [orderBy, { policy_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },

  async listOwnDrafts(
    actorUserId: string,
    query: ListOwnPolicyDraftsQuery,
  ): Promise<{ items: OwnedPolicyDraftRecord[]; total: number }> {
    const where: Prisma.policy_versionsWhereInput = {
      status: 'draft',
      created_by_user_id: actorUserId,
      policies: {
        owner_user_id: actorUserId,
        status: 'draft',
        ...(query.q !== undefined && {
          OR: [
            { policy_code: { contains: query.q, mode: 'insensitive' } },
            { title: { contains: query.q, mode: 'insensitive' } },
          ],
        }),
      },
    };
    const [total, items] = await prisma.$transaction([
      prisma.policy_versions.count({ where }),
      prisma.policy_versions.findMany({
        where,
        select: ownedPolicyDraftSelect,
        orderBy: [{ policies: { updated_at: query.sortOrder } }, { policy_version_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },

  getDraftPolicyVersion(policyId: string, versionId: string) {
    return prisma.policy_versions.findFirst({
      where: {
        policy_version_id: versionId,
        policy_id: policyId,
        status: 'draft',
        policies: { status: 'draft' },
      },
      select: draftPolicyVersionDetailSelect,
    });
  },

  findOwnDraft(database: DatabaseClient, policyId: string, versionId: string, actorUserId: string) {
    return database.policy_versions.findFirst({
      where: {
        policy_version_id: versionId,
        policy_id: policyId,
        status: 'draft',
        created_by_user_id: actorUserId,
        policies: { owner_user_id: actorUserId, status: 'draft' },
      },
      select: ownedPolicyDraftSelect,
    });
  },

  updateOwnDraft(
    database: DatabaseClient,
    policyId: string,
    versionId: string,
    input: UpdatePolicyDraftInput,
    updatedAt: Date,
  ) {
    return database.policies.update({
      where: { policy_id: policyId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        updated_at: updatedAt,
        policy_versions: {
          update: {
            where: { policy_version_id: versionId },
            data: {
              ...(input.versionNumber !== undefined && { version_number: input.versionNumber }),
              ...(input.content !== undefined && { content: input.content }),
              ...(input.changeSummary !== undefined && { change_summary: input.changeSummary }),
            },
          },
        },
      },
      select: { policy_id: true },
    });
  },

  createDraftUpdatedAudit(
    database: DatabaseClient,
    input: {
      actorUserId: string;
      versionId: string;
      changedFields: string[];
      ipAddress: string | null;
      userAgent: string | null;
    },
  ) {
    return database.audit_logs.create({
      data: {
        actor_user_id: input.actorUserId,
        module: 'policy-compliance',
        action: 'policy.draft.updated',
        entity_type: 'policy_version',
        entity_id: input.versionId,
        after_data: { changedFields: input.changedFields },
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      },
      select: { audit_log_id: true },
    });
  },

  createPolicyDraft(database: DatabaseClient, input: CreatePolicyDraftData) {
    return database.policies.create({
      data: {
        policy_code: input.policyCode,
        title: input.title,
        ...(input.description !== undefined ? { description: input.description } : {}),
        owner_user_id: input.actorUserId,
        status: 'draft',
        policy_versions: {
          create: {
            version_number: input.versionNumber,
            content: input.content,
            status: 'draft',
            created_by_user_id: input.actorUserId,
          },
        },
      },
      select: policyDraftSelect,
    });
  },

  createPolicyDraftAudit(
    database: DatabaseClient,
    input: {
      actorUserId: string;
      policyId: string;
      policyCode: string;
      title: string;
      versionNumber: string;
      ipAddress: string | null;
      userAgent: string | null;
    },
  ) {
    return database.audit_logs.create({
      data: {
        actor_user_id: input.actorUserId,
        module: 'policy-compliance',
        action: 'policy.draft.created',
        entity_type: 'policy',
        entity_id: input.policyId,
        after_data: {
          policyCode: input.policyCode,
          title: input.title,
          status: 'draft',
          versionNumber: input.versionNumber,
        },
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      },
      select: { audit_log_id: true },
    });
  },

  findPolicyVersion(database: DatabaseClient, policyId: string, versionId: string) {
    return database.policy_versions.findFirst({
      where: { policy_version_id: versionId, policy_id: policyId },
      select: {
        policy_version_id: true,
        version_number: true,
        status: true,
        policies: { select: { policy_id: true, status: true } },
      },
    });
  },

  archivePublishedVersions(database: DatabaseClient, policyId: string, exceptVersionId: string) {
    return database.policy_versions.updateMany({
      where: {
        policy_id: policyId,
        status: 'published',
        NOT: { policy_version_id: exceptVersionId },
      },
      data: { status: 'archived' },
    });
  },

  publishDraftVersion(
    database: DatabaseClient,
    policyId: string,
    versionId: string,
    context: PublishContext,
  ) {
    return database.policy_versions.updateMany({
      where: { policy_version_id: versionId, policy_id: policyId, status: 'draft' },
      data: {
        status: 'published',
        effective_date: context.effectiveDate,
        published_by_user_id: context.actorUserId,
        published_at: context.publishedAt,
      },
    });
  },

  markPolicyPublished(database: DatabaseClient, policyId: string, publishedAt: Date) {
    return database.policies.update({
      where: { policy_id: policyId },
      data: { status: 'published', updated_at: publishedAt },
      select: { policy_id: true },
    });
  },

  createPublishAudit(
    database: DatabaseClient,
    input: { policyId: string; versionId: string; versionNumber: string },
    context: PublishContext,
  ) {
    return database.audit_logs.create({
      data: {
        actor_user_id: context.actorUserId,
        module: 'policy-compliance',
        action: 'policy.version.published',
        entity_type: 'policy_version',
        entity_id: input.versionId,
        before_data: { status: 'draft' },
        after_data: {
          policyId: input.policyId,
          versionNumber: input.versionNumber,
          status: 'published',
          effectiveDate: context.effectiveDateText,
          publishedAt: context.publishedAt.toISOString(),
        },
        ip_address: context.ipAddress,
        user_agent: context.userAgent,
      },
      select: { audit_log_id: true },
    });
  },

  getPublishedVersion(database: DatabaseClient, policyId: string, versionId: string) {
    return database.policies.findUniqueOrThrow({
      where: { policy_id: policyId },
      select: {
        ...publishPolicyVersionSelect,
        policy_versions: {
          ...publishPolicyVersionSelect.policy_versions,
          where: { policy_version_id: versionId },
        },
      },
    });
  },
} as const;
