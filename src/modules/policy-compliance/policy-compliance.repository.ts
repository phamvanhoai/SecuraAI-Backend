import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

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
