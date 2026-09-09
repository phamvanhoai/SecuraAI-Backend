import type { Prisma, PrismaClient } from '@prisma/client';
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

type CreatePolicyDraftData = {
  policyCode: string;
  title: string;
  description?: string;
  versionNumber: string;
  content: string;
  actorUserId: string;
};

export const policyComplianceRepository = {
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
} as const;
