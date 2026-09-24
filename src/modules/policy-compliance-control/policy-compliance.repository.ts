import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListPublishablePoliciesQuery } from './dto/list-publishable-policies.dto.js';
import type {
  ListOwnPolicyDraftsQuery,
  UpdatePolicyDraftInput,
} from './dto/manage-policy-draft.dto.js';
import type { UpdatePolicyCreateVersionInput } from './dto/update-policy-create-version.dto.js';
import type { ListPolicyDepartmentAssignmentsQuery } from './dto/assign-policy-departments.dto.js';
import type { ListPolicyVersionHistoryQuery } from './dto/policy-version-history.dto.js';

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

export const newPolicyVersionSelect = {
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
      updated_at: true,
    },
  },
} satisfies Prisma.policy_versionsSelect;

export type NewPolicyVersionRecord = Prisma.policy_versionsGetPayload<{
  select: typeof newPolicyVersionSelect;
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

  async listPolicyVersionHistory(
    query: ListPolicyVersionHistoryQuery,
    visibleStatuses?: readonly string[],
  ) {
    const where: Prisma.policy_versionsWhereInput = {
      ...(query.status !== 'all'
        ? {
            status:
              visibleStatuses && !visibleStatuses.includes(query.status)
                ? { in: [] }
                : query.status,
          }
        : visibleStatuses
          ? { status: { in: [...visibleStatuses] } }
          : {}),
      ...(query.q !== undefined && {
        policies: {
          OR: [
            { policy_code: { contains: query.q, mode: 'insensitive' } },
            { title: { contains: query.q, mode: 'insensitive' } },
          ],
        },
      }),
    };
    const select = {
      policy_version_id: true,
      policy_id: true,
      version_number: true,
      change_summary: true,
      status: true,
      effective_date: true,
      created_at: true,
      published_at: true,
      users_policy_versions_created_by_user_idTousers: {
        select: { user_id: true, full_name: true },
      },
      users_policy_versions_published_by_user_idTousers: {
        select: { user_id: true, full_name: true },
      },
      policies: { select: { policy_code: true, title: true, description: true } },
    } satisfies Prisma.policy_versionsSelect;
    const [total, items] = await prisma.$transaction([
      prisma.policy_versions.count({ where }),
      prisma.policy_versions.findMany({
        where,
        select,
        orderBy: [{ created_at: 'desc' }, { version_number: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { total, items };
  },

  findPolicyVersionHistoryDetail(policyId: string, versionId: string) {
    return prisma.policy_versions.findFirst({
      where: { policy_id: policyId, policy_version_id: versionId },
      select: {
        policy_version_id: true,
        policy_id: true,
        version_number: true,
        content: true,
        change_summary: true,
        status: true,
        effective_date: true,
        created_at: true,
        published_at: true,
        users_policy_versions_created_by_user_idTousers: {
          select: { user_id: true, full_name: true },
        },
        users_policy_versions_published_by_user_idTousers: {
          select: { user_id: true, full_name: true },
        },
        policies: { select: { policy_code: true, title: true, description: true } },
      },
    });
  },

  async listPolicyDepartmentAssignments(query: ListPolicyDepartmentAssignmentsQuery) {
    const where: Prisma.policiesWhereInput = {
      status: 'published',
      ...(query.q !== undefined && {
        OR: [
          { policy_code: { contains: query.q, mode: 'insensitive' } },
          { title: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, policies, departments] = await prisma.$transaction([
      prisma.policies.count({ where }),
      prisma.policies.findMany({
        where,
        select: {
          policy_id: true,
          policy_code: true,
          title: true,
          updated_at: true,
          policy_departments: {
            select: {
              department_id: true,
              departments: { select: { code: true, name: true } },
            },
            orderBy: { departments: { name: 'asc' } },
          },
        },
        orderBy: [{ updated_at: 'desc' }, { policy_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.departments.findMany({
        where: { status: 'active' },
        select: { department_id: true, code: true, name: true },
        orderBy: [{ name: 'asc' }, { department_id: 'asc' }],
        take: 201,
      }),
    ]);
    return { total, policies, departments };
  },

  findPublishedPolicy(database: DatabaseClient, policyId: string) {
    return database.policies.findFirst({
      where: { policy_id: policyId, status: 'published' },
      select: {
        policy_id: true,
        policy_code: true,
        policy_departments: { select: { department_id: true } },
      },
    });
  },

  countActiveDepartments(database: DatabaseClient, departmentIds: string[]) {
    return database.departments.count({
      where: { department_id: { in: departmentIds }, status: 'active' },
    });
  },

  async replacePolicyDepartments(
    database: DatabaseClient,
    policyId: string,
    departmentIds: string[],
    actorUserId: string,
  ) {
    await database.policy_departments.deleteMany({ where: { policy_id: policyId } });
    if (departmentIds.length > 0) {
      await database.policy_departments.createMany({
        data: departmentIds.map((departmentId) => ({
          policy_id: policyId,
          department_id: departmentId,
          assigned_by_user_id: actorUserId,
        })),
      });
    }
  },

  createPolicyDepartmentsAudit(
    database: DatabaseClient,
    input: {
      actorUserId: string;
      policyId: string;
      beforeDepartmentIds: string[];
      afterDepartmentIds: string[];
      ipAddress: string | null;
      userAgent: string | null;
    },
  ) {
    return database.audit_logs.create({
      data: {
        actor_user_id: input.actorUserId,
        module: 'policy-compliance',
        action: 'policy.departments.assigned',
        entity_type: 'policy',
        entity_id: input.policyId,
        before_data: { departmentIds: input.beforeDepartmentIds },
        after_data: { departmentIds: input.afterDepartmentIds },
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      },
      select: { audit_log_id: true },
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

  findPolicyForNewVersion(database: DatabaseClient, policyId: string) {
    return database.policies.findUnique({
      where: { policy_id: policyId },
      select: {
        policy_id: true,
        policy_code: true,
        title: true,
        description: true,
        owner_user_id: true,
        status: true,
        policy_versions: {
          where: { status: { in: ['draft', 'published'] } },
          select: {
            policy_version_id: true,
            version_number: true,
            status: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });
  },

  listOwnedPublishedPoliciesForNewVersion(actorUserId: string) {
    return prisma.policies.findMany({
      where: {
        owner_user_id: actorUserId,
        status: 'published',
        policy_versions: {
          some: { status: 'published' },
          none: { status: 'draft' },
        },
      },
      select: {
        policy_id: true,
        policy_code: true,
        title: true,
        description: true,
        updated_at: true,
        policy_versions: {
          where: { status: 'published' },
          select: { version_number: true },
          orderBy: { published_at: 'desc' },
          take: 1,
        },
      },
      orderBy: { updated_at: 'desc' },
      take: 100,
    });
  },

  async createNewPolicyVersion(
    database: DatabaseClient,
    policyId: string,
    input: UpdatePolicyCreateVersionInput,
    actorUserId: string,
    updatedAt: Date,
  ) {
    await database.policies.update({
      where: { policy_id: policyId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        status: 'draft',
        updated_at: updatedAt,
      },
      select: { policy_id: true },
    });
    return database.policy_versions.create({
      data: {
        policy_id: policyId,
        version_number: input.versionNumber,
        content: input.content,
        change_summary: input.changeSummary,
        status: 'draft',
        created_by_user_id: actorUserId,
      },
      select: newPolicyVersionSelect,
    });
  },

  createNewPolicyVersionAudit(
    database: DatabaseClient,
    input: {
      actorUserId: string;
      policyId: string;
      versionId: string;
      previousVersionNumber: string;
      versionNumber: string;
      changedPolicyFields: string[];
      ipAddress: string | null;
      userAgent: string | null;
    },
  ) {
    return database.audit_logs.create({
      data: {
        actor_user_id: input.actorUserId,
        module: 'policy-compliance',
        action: 'policy.version.created',
        entity_type: 'policy_version',
        entity_id: input.versionId,
        before_data: {
          policyId: input.policyId,
          policyStatus: 'published',
          versionNumber: input.previousVersionNumber,
        },
        after_data: {
          policyId: input.policyId,
          policyStatus: 'draft',
          versionNumber: input.versionNumber,
          versionStatus: 'draft',
          changedPolicyFields: input.changedPolicyFields,
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
