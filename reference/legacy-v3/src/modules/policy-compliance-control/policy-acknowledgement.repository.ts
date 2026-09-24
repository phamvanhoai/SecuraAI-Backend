import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { EmployeePolicyQuery } from './dto/acknowledge-policy.dto.js';
type Db = PrismaClient | Prisma.TransactionClient;
const scope = (departmentId: string | null): Prisma.policiesWhereInput => ({
  status: 'published',
  OR: [
    { policy_departments: { none: {} } },
    ...(departmentId ? [{ policy_departments: { some: { department_id: departmentId } } }] : []),
  ],
});
export const policyAcknowledgementRepository = {
  transaction<T>(fn: (db: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(fn);
  },
  async list(userId: string, query: EmployeePolicyQuery) {
    const user = await prisma.users.findFirst({
      where: { user_id: userId, status: 'active', deleted_at: null },
      select: { department_id: true },
    });
    if (!user) return { items: [], total: 0 };
    const where: Prisma.policiesWhereInput = {
      ...scope(user.department_id),
      ...(query.q
        ? {
            AND: [
              {
                OR: [
                  { policy_code: { contains: query.q, mode: 'insensitive' } },
                  { title: { contains: query.q, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
      policy_versions: {
        some: {
          status: 'published',
          ...(query.status === 'pending'
            ? { policy_acknowledgements: { none: { user_id: userId } } }
            : query.status === 'acknowledged'
              ? { policy_acknowledgements: { some: { user_id: userId } } }
              : {}),
        },
      },
    };
    const [total, items] = await prisma.$transaction([
      prisma.policies.count({ where }),
      prisma.policies.findMany({
        where,
        select: {
          policy_id: true,
          policy_code: true,
          title: true,
          description: true,
          policy_versions: {
            where: { status: 'published' },
            orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
            take: 1,
            select: {
              policy_version_id: true,
              version_number: true,
              effective_date: true,
              published_at: true,
              policy_acknowledgements: {
                where: { user_id: userId },
                take: 1,
                select: { acknowledged_at: true },
              },
            },
          },
        },
        orderBy: [{ updated_at: 'desc' }, { policy_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },
  async find(db: Db, userId: string, policyId: string, versionId: string) {
    const user = await db.users.findFirst({
      where: { user_id: userId, status: 'active', deleted_at: null },
      select: { department_id: true },
    });
    if (!user) return null;
    return db.policy_versions.findFirst({
      where: {
        policy_version_id: versionId,
        policy_id: policyId,
        status: 'published',
        policies: scope(user.department_id),
      },
      select: {
        policy_version_id: true,
        version_number: true,
        content: true,
        change_summary: true,
        effective_date: true,
        published_at: true,
        policies: {
          select: { policy_id: true, policy_code: true, title: true, description: true },
        },
        policy_acknowledgements: {
          where: { user_id: userId },
          take: 1,
          select: { acknowledged_at: true },
        },
      },
    });
  },
  create(db: Db, userId: string, versionId: string, ipAddress: string | null) {
    return db.policy_acknowledgements.create({
      data: { user_id: userId, policy_version_id: versionId, ip_address: ipAddress },
      select: { acknowledged_at: true },
    });
  },
  audit(
    db: Db,
    input: {
      userId: string;
      policyId: string;
      versionId: string;
      at: Date;
      ipAddress: string | null;
      userAgent: string | null;
    },
  ) {
    return db.audit_logs.create({
      data: {
        actor_user_id: input.userId,
        module: 'policy-compliance',
        action: 'policy.version.acknowledged',
        entity_type: 'policy_version',
        entity_id: input.versionId,
        after_data: { policyId: input.policyId, acknowledgedAt: input.at.toISOString() },
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      },
      select: { audit_log_id: true },
    });
  },
} as const;
