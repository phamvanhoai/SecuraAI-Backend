import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type {
  FrameworkControlsQuery,
  ListPolicyControlMappingsQuery,
  ReplacePolicyControlMappingsInput,
} from './dto/map-controls.dto.js';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const publishedVersionWhere = (
  query: ListPolicyControlMappingsQuery,
): Prisma.policy_versionsWhereInput => ({
  status: 'published',
  policies: {
    status: 'published',
    ...(query.q
      ? {
          OR: [
            { policy_code: { contains: query.q, mode: 'insensitive' } },
            { title: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  },
});

export const policyControlMappingRepository = {
  transaction<T>(callback: (database: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(callback);
  },

  async listPublishedVersions(query: ListPolicyControlMappingsQuery) {
    const where = publishedVersionWhere(query);
    const [total, items] = await prisma.$transaction([
      prisma.policy_versions.count({ where }),
      prisma.policy_versions.findMany({
        where,
        select: {
          policy_version_id: true,
          version_number: true,
          published_at: true,
          policies: { select: { policy_id: true, policy_code: true, title: true } },
          policy_control_mappings: {
            select: {
              notes: true,
              compliance_controls: {
                select: {
                  compliance_control_id: true,
                  control_code: true,
                  title: true,
                  compliance_frameworks: {
                    select: {
                      compliance_framework_id: true,
                      code: true,
                      name: true,
                      version: true,
                    },
                  },
                },
              },
            },
            orderBy: { compliance_controls: { control_code: 'asc' } },
          },
        },
        orderBy: [{ published_at: 'desc' }, { policy_version_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { total, items };
  },

  listFrameworks() {
    return prisma.compliance_frameworks.findMany({
      select: {
        compliance_framework_id: true,
        code: true,
        name: true,
        version: true,
        description: true,
        _count: { select: { compliance_controls: true } },
      },
      orderBy: [{ name: 'asc' }, { version: 'asc' }],
      take: 100,
    });
  },

  async listFrameworkControls(frameworkId: string, query: FrameworkControlsQuery) {
    const where: Prisma.compliance_controlsWhereInput = {
      compliance_framework_id: frameworkId,
      ...(query.q
        ? {
            OR: [
              { control_code: { contains: query.q, mode: 'insensitive' } },
              { title: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [framework, total, items] = await prisma.$transaction([
      prisma.compliance_frameworks.findUnique({
        where: { compliance_framework_id: frameworkId },
        select: { compliance_framework_id: true },
      }),
      prisma.compliance_controls.count({ where }),
      prisma.compliance_controls.findMany({
        where,
        select: {
          compliance_control_id: true,
          control_code: true,
          title: true,
          description: true,
          parent_compliance_control_id: true,
        },
        orderBy: [{ control_code: 'asc' }, { compliance_control_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { framework, total, items };
  },

  findPublishedVersion(database: DatabaseClient, policyId: string, versionId: string) {
    return database.policy_versions.findFirst({
      where: {
        policy_version_id: versionId,
        policy_id: policyId,
        status: 'published',
        policies: { status: 'published' },
      },
      select: {
        policy_version_id: true,
        policies: { select: { policy_code: true } },
      },
    });
  },

  findFramework(database: DatabaseClient, frameworkId: string) {
    return database.compliance_frameworks.findUnique({
      where: { compliance_framework_id: frameworkId },
      select: { compliance_framework_id: true },
    });
  },

  countFrameworkControls(database: DatabaseClient, frameworkId: string, controlIds: string[]) {
    return database.compliance_controls.count({
      where: {
        compliance_framework_id: frameworkId,
        compliance_control_id: { in: controlIds },
      },
    });
  },

  listExistingFrameworkMappings(database: DatabaseClient, versionId: string, frameworkId: string) {
    return database.policy_control_mappings.findMany({
      where: {
        policy_version_id: versionId,
        compliance_controls: { compliance_framework_id: frameworkId },
      },
      select: { compliance_control_id: true, notes: true },
      orderBy: { compliance_control_id: 'asc' },
    });
  },

  async replaceFrameworkMappings(
    database: DatabaseClient,
    versionId: string,
    frameworkId: string,
    mappings: ReplacePolicyControlMappingsInput['mappings'],
  ) {
    await database.policy_control_mappings.deleteMany({
      where: {
        policy_version_id: versionId,
        compliance_controls: { compliance_framework_id: frameworkId },
      },
    });
    if (mappings.length > 0) {
      await database.policy_control_mappings.createMany({
        data: mappings.map((mapping) => ({
          policy_version_id: versionId,
          compliance_control_id: mapping.controlId,
          notes: mapping.notes?.trim() || null,
        })),
      });
    }
  },

  createAudit(
    database: DatabaseClient,
    input: {
      actorUserId: string;
      policyId: string;
      versionId: string;
      frameworkId: string;
      before: Array<{ compliance_control_id: string; notes: string | null }>;
      after: ReplacePolicyControlMappingsInput['mappings'];
      ipAddress: string | null;
      userAgent: string | null;
    },
  ) {
    return database.audit_logs.create({
      data: {
        actor_user_id: input.actorUserId,
        module: 'policy-compliance',
        action: 'policy.controls.mapped',
        entity_type: 'policy_version',
        entity_id: input.versionId,
        before_data: {
          frameworkId: input.frameworkId,
          mappings: input.before.map((item) => ({
            controlId: item.compliance_control_id,
            notes: item.notes,
          })),
        },
        after_data: { frameworkId: input.frameworkId, mappings: input.after },
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      },
      select: { audit_log_id: true },
    });
  },
} as const;
