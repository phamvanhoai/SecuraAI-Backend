import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListRiskAssessmentsQuery } from './dto/list-risk-assessments-query.dto.js';
import type { CreateRiskAssessmentBody } from './dto/create-risk-assessment.dto.js';
import type { UpdateRiskAssessmentBody } from './dto/update-risk-assessment.dto.js';
import type { CancelRiskAssessmentBody } from './dto/cancel-risk-assessment.dto.js';
import type { RiskCreateOptionsQuery } from './dto/risk-create-options-query.dto.js';

export const riskAssessmentListSelect = {
  risk_assessment_id: true,
  risk_code: true,
  title: true,
  likelihood: true,
  impact: true,
  risk_score: true,
  risk_level: true,
  status: true,
  assessed_by_user_id: true,
  assessed_at: true,
  updated_at: true,
  assets: { select: { asset_id: true, asset_code: true, name: true, deleted_at: true } },
  business_processes: { select: { business_process_id: true, code: true, name: true } },
  users: { select: { user_id: true, full_name: true, deleted_at: true } },
  _count: { select: { risk_treatment_plans: true } },
} satisfies Prisma.risk_assessmentsSelect;

export type RiskAssessmentListRecord = Prisma.risk_assessmentsGetPayload<{
  select: typeof riskAssessmentListSelect;
}>;

export const riskAssessmentDetailSelect = {
  risk_assessment_id: true,
  risk_code: true,
  title: true,
  description: true,
  likelihood: true,
  impact: true,
  risk_score: true,
  risk_level: true,
  residual_likelihood: true,
  residual_impact: true,
  residual_score: true,
  status: true,
  assessed_by_user_id: true,
  assessed_at: true,
  closed_at: true,
  cancelled_at: true,
  cancelled_by_user_id: true,
  cancelled_by_full_name: true,
  cancellation_reason: true,
  created_at: true,
  updated_at: true,
  assets: {
    select: { asset_id: true, asset_code: true, name: true, status: true, deleted_at: true },
  },
  business_processes: {
    select: { business_process_id: true, code: true, name: true, status: true },
  },
  users: { select: { user_id: true, full_name: true, status: true, deleted_at: true } },
  risk_assessment_threats: {
    select: {
      notes: true,
      threats: {
        select: { threat_id: true, code: true, name: true, description: true, category: true },
      },
    },
    orderBy: { threats: { code: 'asc' } },
  },
  risk_assessment_vulnerabilities: {
    select: {
      notes: true,
      vulnerabilities: {
        select: {
          vulnerability_id: true,
          code: true,
          name: true,
          description: true,
          severity: true,
        },
      },
    },
    orderBy: { vulnerabilities: { code: 'asc' } },
  },
  risk_treatment_plans: {
    select: {
      risk_treatment_plan_id: true,
      strategy: true,
      description: true,
      target_date: true,
      status: true,
      submitted_at: true,
      completed_at: true,
      created_at: true,
      updated_at: true,
      users_risk_treatment_plans_owner_user_idTousers: {
        select: { user_id: true, full_name: true, status: true, deleted_at: true },
      },
      risk_treatment_actions: {
        select: {
          risk_treatment_action_id: true,
          title: true,
          description: true,
          due_date: true,
          progress_percent: true,
          status: true,
          completed_at: true,
          users: { select: { user_id: true, full_name: true, status: true, deleted_at: true } },
        },
        orderBy: [{ due_date: 'asc' }, { risk_treatment_action_id: 'asc' }],
        take: 100,
      },
    },
    orderBy: [{ created_at: 'desc' }, { risk_treatment_plan_id: 'asc' }],
    take: 20,
  },
  risk_assessments: {
    select: {
      risk_assessment_id: true,
      risk_code: true,
      title: true,
      risk_score: true,
      risk_level: true,
      assessed_at: true,
      users: { select: { user_id: true, full_name: true, deleted_at: true } },
    },
  },
} satisfies Prisma.risk_assessmentsSelect;

export type RiskAssessmentDetailRecord = Prisma.risk_assessmentsGetPayload<{
  select: typeof riskAssessmentDetailSelect;
}>;

const orderBy = (
  field: ListRiskAssessmentsQuery['sortBy'],
  order: ListRiskAssessmentsQuery['sortOrder'],
): Prisma.risk_assessmentsOrderByWithRelationInput[] => {
  const column = {
    riskCode: 'risk_code',
    title: 'title',
    riskScore: 'risk_score',
    riskLevel: 'risk_level',
    assessedAt: 'assessed_at',
    updatedAt: 'updated_at',
  }[field];
  return [{ [column]: order }, { risk_assessment_id: 'asc' }];
};

const whereFor = (query: ListRiskAssessmentsQuery): Prisma.risk_assessmentsWhereInput => ({
  ...(query.riskLevel && { risk_level: query.riskLevel }),
  ...(query.status && { status: query.status }),
  ...(query.targetType === 'asset' && { asset_id: { not: null } }),
  ...(query.targetType === 'business_process' && { business_process_id: { not: null } }),
  ...(query.hasTreatmentPlan !== undefined && {
    risk_treatment_plans: query.hasTreatmentPlan ? { some: {} } : { none: {} },
  }),
  ...((query.assessedFrom || query.assessedTo) && {
    assessed_at: {
      ...(query.assessedFrom && { gte: new Date(`${query.assessedFrom}T00:00:00.000Z`) }),
      ...(query.assessedTo && { lte: new Date(`${query.assessedTo}T23:59:59.999Z`) }),
    },
  }),
  ...(query.q && {
    OR: [
      { risk_code: { contains: query.q, mode: 'insensitive' } },
      { title: { contains: query.q, mode: 'insensitive' } },
      { assets: { is: { asset_code: { contains: query.q, mode: 'insensitive' } } } },
      { assets: { is: { name: { contains: query.q, mode: 'insensitive' } } } },
      { business_processes: { is: { code: { contains: query.q, mode: 'insensitive' } } } },
      { business_processes: { is: { name: { contains: query.q, mode: 'insensitive' } } } },
      { users: { is: { full_name: { contains: query.q, mode: 'insensitive' } } } },
    ],
  }),
});

export const riskManagementRepository = {
  cancel(
    id: string,
    input: CancelRiskAssessmentBody,
    before: RiskAssessmentDetailRecord,
    context: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ) {
    return prisma.$transaction(async (transaction) => {
      const now = new Date();
      const actor = await transaction.users.findUniqueOrThrow({
        where: { user_id: context.actorUserId },
        select: { full_name: true },
      });
      const changed = await transaction.risk_assessments.updateMany({
        where: {
          risk_assessment_id: id,
          updated_at: new Date(input.expectedUpdatedAt),
          status: { in: ['draft', 'rejected'] },
          risk_treatment_plans: { none: {} },
        },
        data: {
          status: 'cancelled',
          cancelled_at: now,
          cancelled_by_user_id: context.actorUserId,
          cancelled_by_full_name: actor.full_name,
          cancellation_reason: input.reason,
          updated_at: now,
        },
      });
      if (changed.count !== 1) return null;
      const cancelled = await transaction.risk_assessments.findUniqueOrThrow({
        where: { risk_assessment_id: id },
        select: riskAssessmentDetailSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'risk-management',
          action: 'risk-assessment.cancelled',
          entity_type: 'risk_assessment',
          entity_id: id,
          before_data: { status: before.status },
          after_data: {
            status: cancelled.status,
            reason: cancelled.cancellation_reason,
            cancelledAt: cancelled.cancelled_at,
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return cancelled;
    });
  },
  async listCreateOptions(query: RiskCreateOptionsQuery) {
    const skip = (query.page - 1) * query.limit;
    const textFilter = query.q
      ? {
          OR: [
            { code: { contains: query.q, mode: 'insensitive' as const } },
            { name: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    if (query.type === 'assets') {
      const where: Prisma.assetsWhereInput = {
        deleted_at: null,
        status: { not: 'disposed' },
        ...(query.q && {
          OR: [
            { asset_code: { contains: query.q, mode: 'insensitive' } },
            { name: { contains: query.q, mode: 'insensitive' } },
          ],
        }),
      };
      const [total, items] = await prisma.$transaction([
        prisma.assets.count({ where }),
        prisma.assets.findMany({
          where,
          select: { asset_id: true, asset_code: true, name: true },
          orderBy: [{ name: 'asc' }, { asset_id: 'asc' }],
          skip,
          take: query.limit,
        }),
      ]);
      return { type: query.type, total, items };
    }
    if (query.type === 'businessProcesses') {
      const where: Prisma.business_processesWhereInput = { status: 'active', ...textFilter };
      const [total, items] = await prisma.$transaction([
        prisma.business_processes.count({ where }),
        prisma.business_processes.findMany({
          where,
          select: { business_process_id: true, code: true, name: true },
          orderBy: [{ name: 'asc' }, { business_process_id: 'asc' }],
          skip,
          take: query.limit,
        }),
      ]);
      return { type: query.type, total, items };
    }
    if (query.type === 'threats') {
      const where: Prisma.threatsWhereInput = textFilter;
      const [total, items] = await prisma.$transaction([
        prisma.threats.count({ where }),
        prisma.threats.findMany({
          where,
          select: { threat_id: true, code: true, name: true },
          orderBy: [{ code: 'asc' }, { threat_id: 'asc' }],
          skip,
          take: query.limit,
        }),
      ]);
      return { type: query.type, total, items };
    }
    const where: Prisma.vulnerabilitiesWhereInput = textFilter;
    const [total, items] = await prisma.$transaction([
      prisma.vulnerabilities.count({ where }),
      prisma.vulnerabilities.findMany({
        where,
        select: { vulnerability_id: true, code: true, name: true, severity: true },
        orderBy: [{ code: 'asc' }, { vulnerability_id: 'asc' }],
        skip,
        take: query.limit,
      }),
    ]);
    return { type: query.type, total, items };
  },
  findAssetTarget(id: string) {
    return prisma.assets.findUnique({
      where: { asset_id: id },
      select: { asset_id: true, status: true, deleted_at: true },
    });
  },
  findBusinessProcessTarget(id: string) {
    return prisma.business_processes.findUnique({
      where: { business_process_id: id },
      select: { business_process_id: true, status: true },
    });
  },
  findActiveAssessor(id: string) {
    return prisma.users.findFirst({
      where: { user_id: id, deleted_at: null, status: 'active' },
      select: { user_id: true },
    });
  },
  countThreats(ids: string[]) {
    return prisma.threats.count({ where: { threat_id: { in: ids } } });
  },
  countVulnerabilities(ids: string[]) {
    return prisma.vulnerabilities.count({ where: { vulnerability_id: { in: ids } } });
  },
  findPotentialDuplicateForUpdate(id: string, input: UpdateRiskAssessmentBody) {
    return prisma.risk_assessments.findFirst({
      where: {
        risk_assessment_id: { not: id },
        title: { equals: input.title, mode: 'insensitive' },
        ...(input.assetId !== undefined
          ? { asset_id: input.assetId }
          : { business_process_id: input.businessProcessId ?? '' }),
        status: { in: ['draft', 'pending_approval', 'approved', 'in_treatment', 'rejected'] },
      },
      select: { risk_assessment_id: true, risk_code: true },
    });
  },
  update(
    id: string,
    input: UpdateRiskAssessmentBody,
    calculated: { score: number; level: string },
    before: RiskAssessmentDetailRecord,
    context: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ) {
    return prisma.$transaction(async (transaction) => {
      const changed = await transaction.risk_assessments.updateMany({
        where: {
          risk_assessment_id: id,
          updated_at: new Date(input.expectedUpdatedAt),
          status: { in: ['draft', 'rejected'] },
        },
        data: {
          asset_id: input.assetId ?? null,
          business_process_id: input.businessProcessId ?? null,
          title: input.title,
          description: input.description === undefined ? before.description : input.description,
          likelihood: input.likelihood,
          impact: input.impact,
          risk_score: calculated.score,
          risk_level: calculated.level,
          updated_at: new Date(),
        },
      });
      if (changed.count !== 1) return null;
      await transaction.risk_assessment_threats.deleteMany({ where: { risk_assessment_id: id } });
      await transaction.risk_assessment_vulnerabilities.deleteMany({
        where: { risk_assessment_id: id },
      });
      if (input.threats.length)
        await transaction.risk_assessment_threats.createMany({
          data: input.threats.map(({ threatId, notes }) => ({
            risk_assessment_id: id,
            threat_id: threatId,
            ...(notes !== undefined && { notes }),
          })),
        });
      if (input.vulnerabilities.length)
        await transaction.risk_assessment_vulnerabilities.createMany({
          data: input.vulnerabilities.map(({ vulnerabilityId, notes }) => ({
            risk_assessment_id: id,
            vulnerability_id: vulnerabilityId,
            ...(notes !== undefined && { notes }),
          })),
        });
      const updated = await transaction.risk_assessments.findUniqueOrThrow({
        where: { risk_assessment_id: id },
        select: riskAssessmentDetailSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'risk-management',
          action: 'risk-assessment.updated',
          entity_type: 'risk_assessment',
          entity_id: id,
          before_data: {
            title: before.title,
            description: before.description,
            assetId: before.assets?.asset_id ?? null,
            businessProcessId: before.business_processes?.business_process_id ?? null,
            likelihood: before.likelihood,
            impact: before.impact,
            score: before.risk_score,
            level: before.risk_level,
            threatIds: before.risk_assessment_threats.map(({ threats }) => threats.threat_id),
            vulnerabilityIds: before.risk_assessment_vulnerabilities.map(
              ({ vulnerabilities }) => vulnerabilities.vulnerability_id,
            ),
          },
          after_data: {
            title: updated.title,
            description: updated.description,
            assetId: updated.assets?.asset_id ?? null,
            businessProcessId: updated.business_processes?.business_process_id ?? null,
            likelihood: updated.likelihood,
            impact: updated.impact,
            score: updated.risk_score,
            level: updated.risk_level,
            threatIds: updated.risk_assessment_threats.map(({ threats }) => threats.threat_id),
            vulnerabilityIds: updated.risk_assessment_vulnerabilities.map(
              ({ vulnerabilities }) => vulnerabilities.vulnerability_id,
            ),
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return updated;
    });
  },
  create(
    input: CreateRiskAssessmentBody,
    calculated: { riskCode: string; score: number; level: string },
    context: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ) {
    return prisma.$transaction(async (transaction) => {
      const normalizedTitle = input.title.normalize('NFKC').replace(/\s+/gu, ' ').toLowerCase();
      const targetKey = input.assetId
        ? `asset:${input.assetId}`
        : `business-process:${input.businessProcessId ?? ''}`;
      const lockKey = `risk-assessment:create:${targetKey}:${normalizedTitle}`;
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;
      const assessor = await transaction.users.findFirst({
        where: { user_id: context.actorUserId, deleted_at: null, status: 'active' },
        select: { user_id: true },
      });
      if (!assessor) return { failure: 'ASSESSOR_INACTIVE' as const, duplicate: null, risk: null };
      if (input.assetId) {
        const asset = await transaction.assets.findFirst({
          where: { asset_id: input.assetId, deleted_at: null, status: { not: 'disposed' } },
          select: { asset_id: true },
        });
        if (!asset)
          return { failure: 'ASSET_NOT_ASSESSABLE' as const, duplicate: null, risk: null };
      } else {
        const process = await transaction.business_processes.findFirst({
          where: { business_process_id: input.businessProcessId ?? '', status: 'active' },
          select: { business_process_id: true },
        });
        if (!process)
          return { failure: 'BUSINESS_PROCESS_INACTIVE' as const, duplicate: null, risk: null };
      }
      const duplicate = await transaction.risk_assessments.findFirst({
        where: {
          title: { equals: input.title, mode: 'insensitive' },
          ...(input.assetId !== undefined
            ? { asset_id: input.assetId }
            : { business_process_id: input.businessProcessId ?? '' }),
          status: { in: ['draft', 'pending_approval', 'approved', 'in_treatment', 'rejected'] },
        },
        select: { risk_assessment_id: true, risk_code: true },
      });
      if (duplicate) return { failure: null, duplicate, risk: null };
      const risk = await transaction.risk_assessments.create({
        data: {
          risk_code: calculated.riskCode,
          title: input.title,
          ...(input.description !== undefined && { description: input.description }),
          ...(input.assetId !== undefined && { asset_id: input.assetId }),
          ...(input.businessProcessId !== undefined && {
            business_process_id: input.businessProcessId,
          }),
          likelihood: input.likelihood,
          impact: input.impact,
          risk_score: calculated.score,
          risk_level: calculated.level,
          status: 'draft',
          assessed_by_user_id: context.actorUserId,
          ...(input.threats.length && {
            risk_assessment_threats: {
              create: input.threats.map(({ threatId, notes }) => ({
                threat_id: threatId,
                ...(notes !== undefined && { notes }),
              })),
            },
          }),
          ...(input.vulnerabilities.length && {
            risk_assessment_vulnerabilities: {
              create: input.vulnerabilities.map(({ vulnerabilityId, notes }) => ({
                vulnerability_id: vulnerabilityId,
                ...(notes !== undefined && { notes }),
              })),
            },
          }),
        },
        select: {
          risk_assessment_id: true,
          risk_code: true,
          title: true,
          status: true,
          risk_score: true,
          risk_level: true,
          assessed_at: true,
        },
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'risk-management',
          action: 'risk-assessment.created',
          entity_type: 'risk_assessment',
          entity_id: risk.risk_assessment_id,
          after_data: {
            riskCode: risk.risk_code,
            targetType: input.assetId ? 'asset' : 'business_process',
            targetId: input.assetId ?? input.businessProcessId ?? null,
            likelihood: input.likelihood,
            impact: input.impact,
            score: calculated.score,
            level: calculated.level,
            threatIds: input.threats.map(({ threatId }) => threatId),
            vulnerabilityIds: input.vulnerabilities.map(({ vulnerabilityId }) => vulnerabilityId),
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return { failure: null, duplicate: null, risk };
    });
  },
  async list(
    query: ListRiskAssessmentsQuery,
  ): Promise<{ items: RiskAssessmentListRecord[]; total: number }> {
    const where = whereFor(query);
    const [total, items] = await prisma.$transaction([
      prisma.risk_assessments.count({ where }),
      prisma.risk_assessments.findMany({
        where,
        select: riskAssessmentListSelect,
        orderBy: orderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },
  findById(riskAssessmentId: string): Promise<RiskAssessmentDetailRecord | null> {
    return prisma.risk_assessments.findUnique({
      where: { risk_assessment_id: riskAssessmentId },
      select: riskAssessmentDetailSelect,
    });
  },
} as const;
