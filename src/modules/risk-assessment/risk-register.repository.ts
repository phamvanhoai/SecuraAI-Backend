import { Prisma, type risk_status, type treatment_status } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListRiskRegisterQuery } from './dto/view-risk-register.dto.js';
import type {
  CreateRiskAssessmentBody,
  CreateRiskOptionsQuery,
} from './dto/create-risk-assessment.dto.js';
import type { IdentifyThreatBody } from './dto/identify-threat.dto.js';
import type { IdentifyVulnerabilityBody } from './dto/identify-vulnerability.dto.js';
import type { AssessInherentRiskBody } from './dto/assess-inherent-risk.dto.js';
import type { AssessResidualRiskBody } from './dto/assess-residual-risk.dto.js';
import type { DefineTargetRiskBody } from './dto/define-target-risk.dto.js';
import type { CreateTreatmentPlanBody } from './dto/create-treatment-plan.dto.js';
import type { UpdateTreatmentPlanBody } from './dto/update-treatment-plan.dto.js';
import type { DecideRiskAcceptanceBody, SubmitRiskAcceptanceBody } from './dto/risk-acceptance.dto.js';

const assessmentSelect = {
  id: true,
  assessment_type: true,
  inherent_likelihood: true,
  inherent_impact: true,
  inherent_rating: true,
  control_effectiveness: true,
  residual_likelihood: true,
  residual_impact: true,
  residual_rating: true,
  target_risk: true,
  risk_appetite: true,
  risk_tolerance: true,
  assessment_reason: true,
  assessed_at: true,
  review_date: true,
  users: { select: { id: true, full_name: true, status: true } },
} as const;

const listSelect = {
  id: true,
  risk_code: true,
  title: true,
  description: true,
  status: true,
  review_date: true,
  created_at: true,
  updated_at: true,
  users_risks_owner_user_idTousers: { select: { id: true, full_name: true, status: true } },
  risk_assets: {
    select: {
      assets: {
        select: { id: true, asset_code: true, name: true, status: true, criticality: true },
      },
    },
  },
  risk_assessments: {
    select: assessmentSelect,
    orderBy: { assessed_at: 'desc' as const },
    take: 1,
  },
  risk_treatment_plans: {
    where: { status: { in: ['DRAFT', 'ACTIVE'] as treatment_status[] } },
    orderBy: { updated_at: 'desc' as const },
    take: 1,
    select: { id: true, title: true, status: true },
  },
  _count: {
    select: { control_risk_links: true, risk_treatment_plans: true, incident_risks: true },
  },
} as const;

const detailSelect = {
  ...listSelect,
  risk_assessments: {
    select: assessmentSelect,
    orderBy: { assessed_at: 'desc' as const },
  },
  users_risks_created_byTousers: { select: { id: true, full_name: true, status: true } },
  risk_threats: {
    select: {
      id: true,
      name: true,
      description: true,
      risk_threat_vulnerabilities: {
        select: { risk_vulnerabilities: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: 'asc' as const },
  },
  risk_vulnerabilities: {
    select: {
      id: true,
      name: true,
      description: true,
      risk_vulnerability_controls: {
        select: { security_controls: { select: { id: true, control_code: true, name: true } } },
      },
    },
    orderBy: { name: 'asc' as const },
  },
  control_risk_links: {
    select: {
      security_controls: {
        select: {
          id: true,
          control_code: true,
          name: true,
          applicability: true,
          implementation_status: true,
          control_assessments: {
            orderBy: { assessed_at: 'desc' as const },
            take: 1,
            select: { effectiveness: true, result: true, assessed_at: true },
          },
        },
      },
    },
  },
  risk_treatment_plans: {
    select: {
      id: true,
      title: true,
      strategy: true,
      status: true,
      target_completion_date: true,
      users_risk_treatment_plans_owner_user_idTousers: {
        select: { id: true, full_name: true, status: true },
      },
      _count: { select: { risk_treatment_actions: true } },
      updated_at: true,
      risk_treatment_actions: {
        select: { id: true, action_description: true, owner_user_id: true, status: true, due_date: true },
        orderBy: { created_at: 'asc' as const },
      },
    },
    orderBy: { updated_at: 'desc' as const },
  },
  incident_risks: {
    select: {
      incidents: {
        select: {
          id: true,
          incident_code: true,
          title: true,
          severity: true,
          status: true,
          created_at: true,
        },
      },
    },
  },
  risk_acceptances: {
    select: { id: true, decision: true, reason: true, requested_at: true, valid_until: true, requested_by: true, decided_by: true, decided_at: true },
    orderBy: { requested_at: 'desc' as const },
  },
} as const;

export type RiskRegisterRecord = Prisma.risksGetPayload<{ select: typeof listSelect }>;
export type RiskRegisterDetailRecord = Prisma.risksGetPayload<{ select: typeof detailSelect }>;

function whereFor(query: ListRiskRegisterQuery): Prisma.risksWhereInput {
  return {
    ...(query.status ? { status: query.status.toUpperCase() as risk_status } : {}),
    ...(query.ownerId ? { owner_user_id: query.ownerId } : {}),
    ...(query.assetId ? { risk_assets: { some: { asset_id: query.assetId } } } : {}),
    ...(query.riskRating
      ? {
          risk_assessments: {
            some: {
              inherent_rating: query.riskRating.toUpperCase() as
                'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
            },
          },
        }
      : {}),
    ...(query.reviewFrom || query.reviewTo
      ? {
          review_date: {
            ...(query.reviewFrom ? { gte: new Date(`${query.reviewFrom}T00:00:00.000Z`) } : {}),
            ...(query.reviewTo ? { lte: new Date(`${query.reviewTo}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { risk_code: { contains: query.q, mode: 'insensitive' } },
            { title: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
            {
              users_risks_owner_user_idTousers: {
                full_name: { contains: query.q, mode: 'insensitive' },
              },
            },
            {
              risk_assets: {
                some: { assets: { name: { contains: query.q, mode: 'insensitive' } } },
              },
            },
          ],
        }
      : {}),
  };
}

function orderBy(query: ListRiskRegisterQuery): Prisma.risksOrderByWithRelationInput[] {
  if (query.sortBy === 'riskCode') return [{ risk_code: query.sortOrder }, { id: query.sortOrder }];
  if (query.sortBy === 'title') return [{ title: query.sortOrder }, { id: query.sortOrder }];
  if (query.sortBy === 'reviewDate')
    return [{ review_date: { sort: query.sortOrder, nulls: 'last' } }, { id: query.sortOrder }];
  return [{ updated_at: query.sortOrder }, { id: query.sortOrder }];
}

export const riskRegisterRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },
  list(query: ListRiskRegisterQuery) {
    const where = whereFor(query);
    return Promise.all([
      prisma.risks.count({ where }),
      prisma.risks.findMany({
        where,
        select: listSelect,
        relationLoadStrategy: 'join',
        orderBy: orderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },
  findById(riskId: string) {
    return prisma.risks.findUnique({ where: { id: riskId }, select: detailSelect });
  },
  listCreateOptions(query: CreateRiskOptionsQuery) {
    const userWhere: Prisma.usersWhereInput = {
      status: 'ACTIVE',
      role: 'EMPLOYEE',
      ...(query.q ? { full_name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const assetWhere: Prisma.assetsWhereInput = {
      status: 'ACTIVE',
      ...(query.q
        ? {
            OR: [
              { asset_code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const serviceWhere: Prisma.business_servicesWhereInput = {
      status: 'ACTIVE',
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    return prisma.$transaction([
      prisma.assets.findMany({
        where: assetWhere,
        select: { id: true, asset_code: true, name: true, criticality: true },
        orderBy: { name: 'asc' },
        take: query.limit,
      }),
      prisma.business_services.findMany({
        where: serviceWhere,
        select: {
          id: true,
          name: true,
          description: true,
          _count: { select: { assets: { where: { status: 'ACTIVE' } } } },
        },
        orderBy: { name: 'asc' },
        take: query.limit,
      }),
      prisma.users.findMany({
        where: userWhere,
        select: { id: true, full_name: true, email: true, role: true },
        orderBy: { full_name: 'asc' },
        take: query.limit,
      }),
    ]);
  },
  create(actorId: string, input: CreateRiskAssessmentBody, assetIds: string[], riskCode: string) {
    return prisma.risks.create({
      data: {
        risk_code: riskCode,
        title: input.title,
        description: input.description,
        owner_user_id: input.ownerUserId,
        review_date: new Date(`${input.reviewDate}T00:00:00.000Z`),
        created_by: actorId,
        risk_assets: { create: assetIds.map((asset_id) => ({ asset_id })) },
      },
      select: { id: true, risk_code: true, title: true, status: true, created_at: true },
    });
  },
  findOwner(userId: string) {
    return prisma.users.findFirst({
      where: { id: userId, status: 'ACTIVE', role: 'EMPLOYEE' },
      select: { id: true },
    });
  },
  findScopeAssets(scope: CreateRiskAssessmentBody['scope']) {
    return prisma.assets.findMany({
      where:
        scope.type === 'asset'
          ? { id: scope.assetId, status: 'ACTIVE' }
          : {
              business_service_id: scope.businessServiceId,
              status: 'ACTIVE',
              business_services: { status: 'ACTIVE' },
            },
      select: { id: true },
    });
  },
  identifyThreat(riskId: string, input: IdentifyThreatBody) {
    return prisma.$transaction(async (database) => {
      const risk = await database.risks.findUnique({
        where: { id: riskId },
        select: {
          id: true,
          risk_threats: {
            where: { name: { equals: input.name, mode: 'insensitive' } },
            select: { id: true },
            take: 1,
          },
          risk_vulnerabilities: {
            where: { id: { in: input.vulnerabilityIds } },
            select: { id: true },
          },
        },
      });
      if (!risk) return { kind: 'risk_not_found' as const };
      if (risk.risk_threats.length) return { kind: 'duplicate' as const };
      if (risk.risk_vulnerabilities.length !== input.vulnerabilityIds.length)
        return { kind: 'invalid_vulnerabilities' as const };
      const threat = await database.risk_threats.create({
        data: {
          risk_id: riskId,
          name: input.name,
          description: input.description,
          risk_threat_vulnerabilities: {
            create: input.vulnerabilityIds.map((vulnerability_id) => ({ vulnerability_id })),
          },
        },
        select: {
          id: true,
          name: true,
          description: true,
          created_at: true,
          risk_threat_vulnerabilities: {
            select: { risk_vulnerabilities: { select: { id: true, name: true } } },
          },
        },
      });
      return { kind: 'created' as const, threat };
    }, { timeout: 15_000 });
  },
  identifyVulnerability(riskId: string, input: IdentifyVulnerabilityBody) {
    return prisma.$transaction(async (database) => {
      const risk = await database.risks.findUnique({
        where: { id: riskId },
        select: {
          id: true,
          risk_vulnerabilities: {
            where: { name: { equals: input.name, mode: 'insensitive' } },
            select: { id: true },
            take: 1,
          },
          control_risk_links: {
            where: { control_id: { in: input.controlIds } },
            select: { control_id: true },
          },
        },
      });
      if (!risk) return { kind: 'risk_not_found' as const };
      if (risk.risk_vulnerabilities.length) return { kind: 'duplicate' as const };
      if (risk.control_risk_links.length !== input.controlIds.length)
        return { kind: 'invalid_controls' as const };
      const vulnerability = await database.risk_vulnerabilities.create({
        data: {
          risk_id: riskId,
          name: input.name,
          description: input.description,
          risk_vulnerability_controls: {
            create: input.controlIds.map((control_id) => ({ control_id })),
          },
        },
        select: {
          id: true,
          name: true,
          description: true,
          created_at: true,
          risk_vulnerability_controls: {
            select: { security_controls: { select: { id: true, control_code: true, name: true } } },
          },
        },
      });
      return { kind: 'created' as const, vulnerability };
    }, { timeout: 15_000 });
  },
  assessInherentRisk(riskId: string, actorId: string, input: AssessInherentRiskBody) {
    return prisma.$transaction(async (database) => {
      const risk = await database.risks.findUnique({
        where: { id: riskId },
        select: {
          id: true,
          risk_code: true,
          title: true,
          review_date: true,
          _count: { select: { risk_assets: true, risk_threats: true, risk_vulnerabilities: true } },
        },
      });
      if (!risk) return { kind: 'risk_not_found' as const };
      if (
        !risk._count.risk_assets ||
        !risk._count.risk_threats ||
        !risk._count.risk_vulnerabilities
      )
        return { kind: 'incomplete_context' as const };
      const score = input.likelihood * input.impact;
      const rating = score <= 4 ? 'LOW' : score <= 9 ? 'MEDIUM' : score <= 16 ? 'HIGH' : 'CRITICAL';
      const assessment = await database.risk_assessments.create({
        data: {
          risk_id: riskId,
          assessment_type: 'PERIODIC_REVIEW',
          inherent_likelihood: input.likelihood,
          inherent_impact: input.impact,
          inherent_rating: rating,
          assessment_reason: input.assessmentReason,
          assessed_by: actorId,
          review_date: risk.review_date,
        },
        select: { id: true, assessed_at: true },
      });
      return { kind: 'created' as const, assessment, risk, score, rating };
    });
  },
  assessResidualRisk(riskId: string, actorId: string, input: AssessResidualRiskBody) {
    return prisma.$transaction(async (database) => {
      const risk = await database.risks.findUnique({
        where: { id: riskId },
        select: {
          id: true,
          risk_code: true,
          title: true,
          owner_user_id: true,
          review_date: true,
          risk_assessments: {
            where: {
              inherent_likelihood: { not: null },
              inherent_impact: { not: null },
              inherent_rating: { not: null },
            },
            orderBy: { assessed_at: 'desc' },
            take: 1,
            select: { inherent_likelihood: true, inherent_impact: true, inherent_rating: true },
          },
          control_risk_links: {
            select: {
              security_controls: {
                select: {
                  id: true,
                  implementation_status: true,
                  control_assessments: {
                    where: { effectiveness: { not: null } },
                    orderBy: { assessed_at: 'desc' },
                    take: 1,
                    select: { effectiveness: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!risk) return { kind: 'risk_not_found' as const };
      if (risk.owner_user_id !== actorId) return { kind: 'not_owner' as const };
      const inherent = risk.risk_assessments[0];
      if (!inherent) return { kind: 'inherent_required' as const };
      if (
        !risk.control_risk_links.length ||
        risk.control_risk_links.some(
          ({ security_controls }) => !security_controls.control_assessments[0],
        )
      )
        return { kind: 'control_assessments_required' as const };
      const values = risk.control_risk_links.map(
        ({ security_controls }) =>
          security_controls.control_assessments[0]?.effectiveness?.toNumber() ?? 0,
      );
      const controlEffectiveness = values.reduce((sum, value) => sum + value, 0) / values.length;
      const score = input.likelihood * input.impact;
      const rating = score <= 4 ? 'LOW' : score <= 9 ? 'MEDIUM' : score <= 16 ? 'HIGH' : 'CRITICAL';
      const assessment = await database.risk_assessments.create({
        data: {
          risk_id: riskId,
          assessment_type: 'PERIODIC_REVIEW',
          inherent_likelihood: inherent.inherent_likelihood,
          inherent_impact: inherent.inherent_impact,
          inherent_rating: inherent.inherent_rating,
          control_effectiveness: controlEffectiveness,
          residual_likelihood: input.likelihood,
          residual_impact: input.impact,
          residual_rating: rating,
          target_risk: input.targetRisk.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
          risk_appetite: input.riskAppetite.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
          risk_tolerance: input.riskTolerance.toUpperCase() as
            'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
          assessment_reason: input.assessmentReason,
          assessed_by: actorId,
          review_date: risk.review_date,
        },
        select: { id: true, assessed_at: true },
      });
      return { kind: 'created' as const, risk, assessment, score, rating, controlEffectiveness };
    });
  },
  defineTargetRisk(riskId: string, actorId: string, input: DefineTargetRiskBody) {
    return prisma.$transaction(async (database) => {
      const risk = await database.risks.findUnique({
        where: { id: riskId },
        select: {
          id: true,
          risk_code: true,
          title: true,
          owner_user_id: true,
          review_date: true,
          risk_assessments: {
            where: { residual_rating: { not: null } },
            orderBy: { assessed_at: 'desc' },
            take: 1,
          },
          risk_treatment_plans: {
            where: { id: input.treatmentPlanId, status: { in: ['DRAFT', 'ACTIVE'] } },
            select: { id: true, title: true, strategy: true },
          },
        },
      });
      if (!risk) return { kind: 'risk_not_found' as const };
      if (risk.owner_user_id !== actorId) return { kind: 'not_owner' as const };
      const current = risk.risk_assessments[0];
      if (!current) return { kind: 'residual_required' as const };
      const plan = risk.risk_treatment_plans[0];
      if (!plan) return { kind: 'plan_required' as const };
      const rank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
      const target = input.targetRisk.toUpperCase() as keyof typeof rank;
      if (rank[target] > rank[current.residual_rating!])
        return { kind: 'target_exceeds_residual' as const };
      const assessment = await database.risk_assessments.create({
        data: {
          risk_id: riskId,
          assessment_type: 'PERIODIC_REVIEW',
          inherent_likelihood: current.inherent_likelihood,
          inherent_impact: current.inherent_impact,
          inherent_rating: current.inherent_rating,
          control_effectiveness: current.control_effectiveness,
          residual_likelihood: current.residual_likelihood,
          residual_impact: current.residual_impact,
          residual_rating: current.residual_rating,
          target_risk: target,
          risk_appetite: current.risk_appetite,
          risk_tolerance: current.risk_tolerance,
          assessment_reason: input.rationale,
          assessed_by: actorId,
          review_date: risk.review_date,
        },
        select: { id: true, assessed_at: true },
      });
      await database.risk_treatment_plans.update({
        where: { id: plan.id },
        data: { source_assessment_id: assessment.id },
      });
      return { kind: 'created' as const, risk, current, plan, assessment, target };
    });
  },
  treatmentPlanOptions(q: string, limit: number) {
    return prisma.$transaction([
      prisma.users.findMany({ where: { status: 'ACTIVE', ...(q ? { OR: [{ full_name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) }, select: { id: true, full_name: true, email: true }, orderBy: { full_name: 'asc' }, take: limit }),
      prisma.security_controls.findMany({ where: q ? { OR: [{ control_code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}, select: { id: true, control_code: true, name: true, implementation_status: true }, orderBy: { control_code: 'asc' }, take: limit }),
    ]);
  },
  createTreatmentPlan(actorId: string, input: CreateTreatmentPlanBody) {
    return prisma.$transaction(async (database) => {
      const risk = await database.risks.findUnique({ where: { id: input.riskId }, select: { id: true, risk_code: true, owner_user_id: true, review_date: true, risk_assessments: { orderBy: { assessed_at: 'desc' }, take: 1 }, risk_treatment_plans: { where: { status: { in: ['DRAFT', 'ACTIVE'] } }, select: { id: true }, take: 1 } } });
      if (!risk) return { kind: 'risk_not_found' as const };
      const actor = await database.users.findUnique({ where: { id: actorId }, select: { role: true } });
      if (actor?.role !== 'SECURITY_OFFICER' && risk.owner_user_id !== actorId) return { kind: 'forbidden' as const };
      if (risk.risk_treatment_plans.length) return { kind: 'active_plan_exists' as const };
      const users = await database.users.count({ where: { id: { in: [input.ownerUserId, ...input.actions.map((item) => item.assignedToUserId)] }, status: 'ACTIVE' } });
      if (users !== new Set([input.ownerUserId, ...input.actions.map((item) => item.assignedToUserId)]).size) return { kind: 'invalid_users' as const };
      const controls = await database.security_controls.findMany({ where: { id: { in: input.controlIds } }, select: { id: true } });
      if (controls.length !== new Set(input.controlIds).size) return { kind: 'invalid_controls' as const };
      const latest = risk.risk_assessments[0];
      const source = await database.risk_assessments.create({ data: { risk_id: risk.id, assessment_type: 'PERIODIC_REVIEW', inherent_likelihood: latest?.inherent_likelihood ?? null, inherent_impact: latest?.inherent_impact ?? null, inherent_rating: latest?.inherent_rating ?? null, control_effectiveness: latest?.control_effectiveness ?? null, residual_likelihood: latest?.residual_likelihood ?? null, residual_impact: latest?.residual_impact ?? null, residual_rating: latest?.residual_rating ?? null, target_risk: input.targetRisk.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', risk_appetite: latest?.risk_appetite ?? null, risk_tolerance: latest?.risk_tolerance ?? null, assessment_reason: `Treatment plan: ${input.title}`, assessed_by: actorId, review_date: risk.review_date }, select: { id: true } });
      await database.control_risk_links.createMany({ data: input.controlIds.map((control_id) => ({ control_id, risk_id: risk.id })), skipDuplicates: true });
      const plan = await database.risk_treatment_plans.create({ data: { risk_id: risk.id, source_assessment_id: source.id, title: input.title, strategy: input.strategy.toUpperCase() as 'AVOID' | 'MITIGATE' | 'TRANSFER' | 'ACCEPT', owner_user_id: input.ownerUserId, target_completion_date: new Date(`${input.targetDate}T00:00:00.000Z`), created_by: actorId, risk_treatment_actions: { create: input.actions.map((item) => ({ action_description: item.description ? `${item.title}: ${item.description}` : item.title, owner_user_id: item.assignedToUserId, due_date: new Date(`${item.dueDate}T00:00:00.000Z`) })) } }, select: { id: true, title: true, strategy: true, status: true, target_completion_date: true, created_at: true } });
      return { kind: 'created' as const, plan, riskCode: risk.risk_code, actionCount: input.actions.length, controlCount: controls.length, targetRisk: input.targetRisk };
    }, { maxWait: 10_000, timeout: 15_000 }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return { kind: 'active_plan_exists' as const };
      throw error;
    });
  },
  updateTreatmentPlan(planId: string, actorId: string, input: UpdateTreatmentPlanBody) {
    return prisma.$transaction(async (database) => {
      const plan = await database.risk_treatment_plans.findUnique({ where: { id: planId }, include: { risks: { select: { owner_user_id: true, risk_code: true } }, risk_treatment_actions: true } });
      if (!plan) return { kind: 'not_found' as const };
      if (['COMPLETED', 'CANCELLED'].includes(plan.status)) return { kind: 'terminal_plan' as const };
      const actor = await database.users.findUnique({ where: { id: actorId }, select: { role: true } });
      if (actor?.role !== 'SECURITY_OFFICER' && plan.risks.owner_user_id !== actorId) return { kind: 'forbidden' as const };
      if (plan.updated_at.toISOString() !== input.expectedUpdatedAt) return { kind: 'conflict' as const };
      if (input.status === 'completed' && input.actions.some((item) => !['completed', 'cancelled'].includes(item.status))) return { kind: 'incomplete_actions' as const };
      const userIds = [...new Set([input.ownerUserId, ...input.actions.map((item) => item.assignedToUserId)])];
      if (await database.users.count({ where: { id: { in: userIds }, status: 'ACTIVE' } }) !== userIds.length) return { kind: 'invalid_users' as const };
      const existing = new Map(plan.risk_treatment_actions.map((item) => [item.id, item]));
      if (input.actions.some((item) => item.id && !existing.has(item.id))) return { kind: 'invalid_actions' as const };
      const supplied = new Set(input.actions.flatMap((item) => item.id ? [item.id] : []));
      if (plan.risk_treatment_actions.some((item) => !supplied.has(item.id) && item.status !== 'PENDING')) return { kind: 'started_action_removed' as const };
      await database.risk_treatment_actions.deleteMany({ where: { treatment_plan_id: planId, status: 'PENDING', id: { notIn: [...supplied] } } });
      for (const item of input.actions) {
        const data = { action_description: item.title, owner_user_id: item.assignedToUserId, due_date: new Date(`${item.dueDate}T00:00:00.000Z`), status: item.status.toUpperCase() as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED', completed_at: item.status === 'completed' ? new Date() : null };
        if (item.id) await database.risk_treatment_actions.update({ where: { id: item.id }, data });
        else await database.risk_treatment_actions.create({ data: { ...data, treatment_plan_id: planId } });
      }
      const updated = await database.risk_treatment_plans.update({ where: { id: planId }, data: { title: input.title, strategy: input.strategy.toUpperCase() as 'AVOID' | 'MITIGATE' | 'TRANSFER' | 'ACCEPT', owner_user_id: input.ownerUserId, target_completion_date: new Date(`${input.targetDate}T00:00:00.000Z`), status: input.status.toUpperCase() as 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED', updated_at: new Date() }, include: { risk_treatment_actions: { orderBy: { created_at: 'asc' } } } });
      return { kind: 'updated' as const, updated, riskCode: plan.risks.risk_code };
    }, { maxWait: 10_000, timeout: 15_000 });
  },
  submitAcceptance(riskId: string, actorId: string, input: SubmitRiskAcceptanceBody) {
    return prisma.$transaction(async (database) => {
      const risk = await database.risks.findUnique({ where: { id: riskId }, select: { id: true, risk_code: true, owner_user_id: true, review_date: true, risk_assessments: { orderBy: { assessed_at: 'desc' }, take: 1 }, risk_treatment_plans: { where: { id: input.treatmentPlanId, status: { in: ['DRAFT', 'ACTIVE', 'COMPLETED'] } }, select: { id: true, status: true, risk_treatment_actions: { select: { status: true } } } }, risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 } } });
      if (!risk) return { kind: 'not_found' as const };
      if (risk.owner_user_id !== actorId) return { kind: 'not_owner' as const };
      if (!risk.risk_treatment_plans[0]) return { kind: 'invalid_plan' as const };
      const selectedPlan = risk.risk_treatment_plans[0];
      if (selectedPlan.status === 'COMPLETED' && input.treatmentPlanStatus !== 'completed') return { kind: 'invalid_plan_status' as const };
      if (input.treatmentPlanStatus === 'completed' && selectedPlan.risk_treatment_actions.some((item) => !['COMPLETED', 'CANCELLED'].includes(item.status))) return { kind: 'incomplete_actions' as const };
      if (risk.risk_acceptances[0]) return { kind: 'pending_exists' as const };
      const latest = risk.risk_assessments[0]; const score = input.residualLikelihood * input.residualImpact; const rating = score <= 4 ? 'LOW' : score <= 9 ? 'MEDIUM' : score <= 16 ? 'HIGH' : 'CRITICAL';
      const assessment = await database.risk_assessments.create({ data: { risk_id: riskId, assessment_type: 'PERIODIC_REVIEW', inherent_likelihood: latest?.inherent_likelihood ?? null, inherent_impact: latest?.inherent_impact ?? null, inherent_rating: latest?.inherent_rating ?? null, control_effectiveness: latest?.control_effectiveness ?? null, residual_likelihood: input.residualLikelihood, residual_impact: input.residualImpact, residual_rating: rating, target_risk: latest?.target_risk ?? null, risk_appetite: latest?.risk_appetite ?? null, risk_tolerance: latest?.risk_tolerance ?? null, assessment_reason: input.assessmentReason, assessed_by: actorId, review_date: risk.review_date }, select: { id: true, assessed_at: true } });
      await database.risk_treatment_plans.update({ where: { id: input.treatmentPlanId }, data: { status: input.treatmentPlanStatus.toUpperCase() as 'DRAFT' | 'ACTIVE' | 'COMPLETED', source_assessment_id: assessment.id, updated_at: new Date() } });
      const acceptance = await database.risk_acceptances.create({ data: { risk_id: riskId, requested_by: actorId, reason: input.acceptanceReason, valid_until: new Date(`${input.validUntil}T00:00:00.000Z`) }, select: { id: true, decision: true, requested_at: true, valid_until: true } });
      return { kind: 'submitted' as const, riskCode: risk.risk_code, assessment, acceptance, rating, score };
    }, { maxWait: 10_000, timeout: 15_000 });
  },
  decideAcceptance(acceptanceId: string, actorId: string, input: DecideRiskAcceptanceBody) {
    return prisma.$transaction(async (database) => {
      const actor = await database.users.findUnique({ where: { id: actorId }, select: { role: true } });
      if (!actor || !['SECURITY_OFFICER', 'EXECUTIVE'].includes(actor.role)) return { kind: 'forbidden' as const };
      const acceptance = await database.risk_acceptances.findUnique({ where: { id: acceptanceId }, include: { risks: { select: { id: true, risk_code: true } } } });
      if (!acceptance) return { kind: 'not_found' as const };
      if (acceptance.decision !== 'PENDING') return { kind: 'already_decided' as const };
      if (acceptance.requested_by === actorId) return { kind: 'self_approval' as const };
      const decision = input.decision.toUpperCase() as 'APPROVED' | 'REJECTED';
      const updated = await database.risk_acceptances.update({ where: { id: acceptanceId }, data: { decision, reason: input.reason, decided_by: actorId, decided_at: new Date() } });
      if (decision === 'APPROVED') await database.risks.update({ where: { id: acceptance.risk_id }, data: { status: 'ACCEPTED', updated_at: new Date() } });
      return { kind: 'decided' as const, updated, riskCode: acceptance.risks.risk_code };
    }, { maxWait: 10_000, timeout: 15_000 });
  },
};
