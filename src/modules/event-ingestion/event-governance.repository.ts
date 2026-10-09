import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListEventGovernancePoliciesQuery } from './dto/event-governance-policy.dto.js';

function mapSortColumn(
  sortBy: ListEventGovernancePoliciesQuery['sortBy'],
): keyof Prisma.event_data_governance_policiesOrderByWithRelationInput {
  switch (sortBy) {
    case 'name':
      return 'name';
    case 'retentionDays':
      return 'retention_days';
    case 'archiveAfterDays':
      return 'archive_after_days';
    case 'status':
      return 'status';
    case 'updatedAt':
      return 'updated_at';
    case 'createdAt':
    default:
      return 'created_at';
  }
}

export function buildEventGovernanceWhereClause(
  query: ListEventGovernancePoliciesQuery,
): Prisma.event_data_governance_policiesWhereInput {
  const andConditions: Prisma.event_data_governance_policiesWhereInput[] = [];

  if (query.eventFamily) {
    andConditions.push({ event_family: query.eventFamily });
  }

  if (query.status) {
    andConditions.push({ status: query.status });
  }

  if (query.search) {
    const searchConditions: Prisma.event_data_governance_policiesWhereInput[] = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { purpose: { contains: query.search, mode: 'insensitive' } },
      { access_scope: { contains: query.search, mode: 'insensitive' } },
    ];
    andConditions.push({ OR: searchConditions });
  }

  if (andConditions.length === 0) {
    return {};
  }

  if (andConditions.length === 1 && andConditions[0]) {
    return andConditions[0];
  }

  return { AND: andConditions };
}

export type GovernancePolicyWithUsers = {
  id: string;
  name: string;
  purpose: string;
  event_family: 'AUTHENTICATION' | 'VPN_SSO' | 'APPLICATION_ACCESS' | null;
  retention_days: number;
  access_scope: string | null;
  masking_rules: Prisma.JsonValue | null;
  export_allowed: boolean;
  archive_after_days: number | null;
  deletion_enabled: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
  creator: { id: string; full_name: string | null; email: string } | null;
  updater: { id: string; full_name: string | null; email: string } | null;
};

export const eventGovernanceRepository = {
  findActorUser(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, full_name: true, email: true, role: true, status: true },
    });
  },

  async findMany(query: ListEventGovernancePoliciesQuery): Promise<GovernancePolicyWithUsers[]> {
    const sortField = mapSortColumn(query.sortBy);
    const skip = (query.page - 1) * query.limit;
    const where = buildEventGovernanceWhereClause(query);

    const records = await prisma.event_data_governance_policies.findMany({
      where,
      orderBy: { [sortField]: query.sortOrder },
      skip,
      take: query.limit,
      select: {
        id: true,
        name: true,
        purpose: true,
        event_family: true,
        retention_days: true,
        access_scope: true,
        masking_rules: true,
        export_allowed: true,
        archive_after_days: true,
        deletion_enabled: true,
        status: true,
        created_by: true,
        updated_by: true,
        created_at: true,
        updated_at: true,
      },
    });

    const userIds = Array.from(
      new Set(records.flatMap((r) => [r.created_by, r.updated_by]).filter(Boolean)),
    );

    const users =
      userIds.length > 0
        ? await prisma.users.findMany({
            where: { id: { in: userIds } },
            select: { id: true, full_name: true, email: true },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    return records.map((record) => ({
      ...record,
      creator: userMap.get(record.created_by) ?? null,
      updater: userMap.get(record.updated_by) ?? null,
    }));
  },

  count(query?: ListEventGovernancePoliciesQuery) {
    const where = query ? buildEventGovernanceWhereClause(query) : undefined;
    return where
      ? prisma.event_data_governance_policies.count({ where })
      : prisma.event_data_governance_policies.count();
  },

  async findById(id: string): Promise<GovernancePolicyWithUsers | null> {
    const record = await prisma.event_data_governance_policies.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        purpose: true,
        event_family: true,
        retention_days: true,
        access_scope: true,
        masking_rules: true,
        export_allowed: true,
        archive_after_days: true,
        deletion_enabled: true,
        status: true,
        created_by: true,
        updated_by: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!record) return null;

    const userIds = Array.from(new Set([record.created_by, record.updated_by].filter(Boolean)));
    const users =
      userIds.length > 0
        ? await prisma.users.findMany({
            where: { id: { in: userIds } },
            select: { id: true, full_name: true, email: true },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      ...record,
      creator: userMap.get(record.created_by) ?? null,
      updater: userMap.get(record.updated_by) ?? null,
    };
  },

  findAllActive() {
    return prisma.event_data_governance_policies.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        retention_days: true,
        archive_after_days: true,
        deletion_enabled: true,
        export_allowed: true,
        status: true,
      },
    });
  },

  async update(
    id: string,
    data: {
      name?: string;
      purpose?: string;
      event_family?: 'AUTHENTICATION' | 'VPN_SSO' | 'APPLICATION_ACCESS' | null;
      retention_days?: number;
      access_scope?: string | null;
      masking_rules?: Prisma.InputJsonValue | Record<string, unknown> | null;
      export_allowed?: boolean;
      archive_after_days?: number | null;
      deletion_enabled?: boolean;
      status?: 'ACTIVE' | 'INACTIVE';
      updated_by: string;
    },
  ): Promise<GovernancePolicyWithUsers | null> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.event_data_governance_policies.findUnique({
        where: { id },
      });
      if (!before) return null;

      const updated = await tx.event_data_governance_policies.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.purpose !== undefined ? { purpose: data.purpose } : {}),
          ...(data.event_family !== undefined ? { event_family: data.event_family } : {}),
          ...(data.retention_days !== undefined ? { retention_days: data.retention_days } : {}),
          ...(data.access_scope !== undefined ? { access_scope: data.access_scope } : {}),
          ...(data.masking_rules !== undefined
            ? { masking_rules: data.masking_rules as Prisma.InputJsonValue }
            : {}),
          ...(data.export_allowed !== undefined ? { export_allowed: data.export_allowed } : {}),
          ...(data.archive_after_days !== undefined
            ? { archive_after_days: data.archive_after_days }
            : {}),
          ...(data.deletion_enabled !== undefined
            ? { deletion_enabled: data.deletion_enabled }
            : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          updated_by: data.updated_by,
          updated_at: new Date(),
        },
      });

      const previous = await tx.audit_logs.findFirst({
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        select: { record_hash: true },
      });

      const recordHash = createHash('sha256')
        .update(
          JSON.stringify({
            previousHash: previous?.record_hash ?? null,
            actorUserId: data.updated_by,
            policyId: id,
            beforeData: {
              name: before.name,
              purpose: before.purpose,
              retention_days: before.retention_days,
              archive_after_days: before.archive_after_days,
              deletion_enabled: before.deletion_enabled,
              export_allowed: before.export_allowed,
              access_scope: before.access_scope,
              masking_rules: before.masking_rules,
              status: before.status,
            },
            afterData: {
              name: updated.name,
              purpose: updated.purpose,
              retention_days: updated.retention_days,
              archive_after_days: updated.archive_after_days,
              deletion_enabled: updated.deletion_enabled,
              export_allowed: updated.export_allowed,
              access_scope: updated.access_scope,
              masking_rules: updated.masking_rules,
              status: updated.status,
            },
          }),
        )
        .digest('hex');

      await tx.audit_logs.create({
        data: {
          actor_user_id: data.updated_by,
          actor_type: 'USER',
          action: 'UPDATE_EVENT_GOVERNANCE_POLICY',
          resource_type: 'EVENT_DATA_GOVERNANCE_POLICY',
          resource_id: id,
          source: 'API',
          before_data: {
            name: before.name,
            purpose: before.purpose,
            retention_days: before.retention_days,
            archive_after_days: before.archive_after_days,
            deletion_enabled: before.deletion_enabled,
            export_allowed: before.export_allowed,
            access_scope: before.access_scope,
            masking_rules: before.masking_rules,
            status: before.status,
          },
          after_data: {
            name: updated.name,
            purpose: updated.purpose,
            retention_days: updated.retention_days,
            archive_after_days: updated.archive_after_days,
            deletion_enabled: updated.deletion_enabled,
            export_allowed: updated.export_allowed,
            access_scope: updated.access_scope,
            masking_rules: updated.masking_rules,
            status: updated.status,
          },
          ...(previous ? { previous_hash: previous.record_hash } : {}),
          record_hash: recordHash,
        },
      });

      const userIds = Array.from(
        new Set([updated.created_by, updated.updated_by].filter(Boolean)),
      );
      const users =
        userIds.length > 0
          ? await tx.users.findMany({
              where: { id: { in: userIds } },
              select: { id: true, full_name: true, email: true },
            })
          : [];

      const userMap = new Map(users.map((u) => [u.id, u]));

      return {
        ...updated,
        creator: userMap.get(updated.created_by) ?? null,
        updater: userMap.get(updated.updated_by) ?? null,
      };
    });
  },
};
