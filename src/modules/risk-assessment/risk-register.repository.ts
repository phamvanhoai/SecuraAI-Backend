import { readAcceptanceCost } from './dto/acceptance-cost.dto.js';
import { currentRiskReview } from './current-risk-review.js';
import { reviewDeadline, vietnamDate } from './review-schedule.js';
import type { CompleteRiskReview } from './dto/complete-risk-review.dto.js';
import { createHash, randomUUID } from 'node:crypto';
import { responsibilityWhere } from '../user-management-authorization/index.js';
import { Prisma, type risk_status, type treatment_status } from '@prisma/client';
import { assessmentRequiresReview, vulnerabilityBlockedReason } from './vulnerability-workflow.js';
import { residualControlLinks, residualControlBasis, sameResidualControlBasis, validateResidualControls } from './residual-control-basis.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { ListRiskRegisterQuery } from './dto/view-risk-register.dto.js';
import type {
  CreateRiskAssessmentBody,
  CreateRiskOptionsQuery,
} from './dto/create-risk-assessment.dto.js';
import type { IdentifyThreatBody, UpdateThreatBody } from './dto/identify-threat.dto.js';
import type {
  IdentifyVulnerabilityBody,
  UpdateVulnerabilityBody,
} from './dto/identify-vulnerability.dto.js';
import type { AssessInherentRiskBody } from './dto/assess-inherent-risk.dto.js';
import type { AssessResidualRiskBody } from './dto/assess-residual-risk.dto.js';
import type { DefineTargetRiskBody } from './dto/define-target-risk.dto.js';
import type { CreateTreatmentPlanBody } from './dto/create-treatment-plan.dto.js';
import type { UpdateTreatmentPlanBody } from './dto/update-treatment-plan.dto.js';
import type {
  DecideRiskAcceptanceBody,
  SubmitRiskAcceptanceBody,
  OpenRiskReviewBody,
} from './dto/risk-acceptance.dto.js';

async function contextWriteTime(database: Prisma.TransactionClient): Promise<Date> {
  // PostgreSQL now() is the transaction start, possibly before a row-lock wait.
  const rows = await database.$queryRaw<{ time: Date }[]>`SELECT clock_timestamp() AS time`;
  const time = rows[0]?.time;
  if (!time) throw new Error('Unable to timestamp risk context');
  return time;
}

function currentOrFutureReviewDate(reviewDate: Date | null, assessedAt: Date): Date | null {
  if (!reviewDate) return null;
  return reviewDate.toISOString().slice(0, 10) >= assessedAt.toISOString().slice(0, 10)
    ? reviewDate
    : null;
}

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
  methodology_version: true,
  users: { select: { id: true, full_name: true, status: true } },
} as const;

const listSelect = {
  scope_type: true,
  business_services: { select: { id: true, name: true, status: true } },
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
    where: { assessment_type: { not: 'TARGET_DEFINITION' as const } },
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
  risk_assets: {
    select: {
      assets: {
        select: { id: true, asset_code: true, name: true, status: true, criticality: true, classified_at: true },
      },
    },
  },
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
      created_at: true,
      updated_at: true,
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
      created_at: true,
      updated_at: true,
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
      acceptance_cost_basis: true,
      users_risk_treatment_plans_owner_user_idTousers: {
        select: { id: true, full_name: true, status: true },
      },
      _count: { select: { risk_treatment_actions: true } },
      updated_at: true,
      risk_treatment_actions: {
        select: {
          id: true,
          action_description: true,
          owner_user_id: true,
          status: true,
          due_date: true,
        },
        orderBy: { created_at: 'asc' as const },
      },
      risk_treatment_plan_controls: {
        select: { security_controls: { select: { id: true, control_code: true, name: true } } },
        orderBy: { linked_at: 'asc' as const },
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
    select: {
      id: true,
      decision: true,
      reason: true,
      requested_at: true,
      valid_until: true,
      requested_by: true,
      decided_by: true,
      decided_at: true,
    },
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
            { business_services: { name: { contains: query.q, mode: 'insensitive' } } },
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
  findTargetHistory(riskId: string) {
    return prisma.audit_logs.findMany({
      where: { resource_id: riskId, resource_type: 'RISK', action: 'RISK_TARGET_DEFINED', outcome: 'SUCCESS' },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }], take: 100,
      select: { after_data: true },
    });
  },
  findAssetContextChange(assetIds: string[], assessedAt: Date) {
    return prisma.audit_logs.findFirst({
      where: {
        resource_type: 'ASSET', resource_id: { in: assetIds },
        action: 'ASSET_CONTEXT_UPDATED', outcome: 'SUCCESS', occurred_at: { gt: assessedAt },
      },
      select: { id: true },
    });
  },
  findContextHistory(riskId: string) {
    return prisma.audit_logs.findMany({
      where: {
        resource_id: riskId,
        action: {
          in: [
            'RISK_THREAT_CREATED',
            'RISK_THREAT_UPDATED',
            'RISK_VULNERABILITY_CREATED',
            'RISK_VULNERABILITY_UPDATED',
          ],
        },
        outcome: 'SUCCESS',
      },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        id: true,
        action: true,
        occurred_at: true,
        before_data: true,
        after_data: true,
        users: { select: { id: true, full_name: true, email: true } },
      },
    });
  },
  listCreateOptions(query: CreateRiskOptionsQuery) {
    const userWhere: Prisma.usersWhereInput = {
      status: 'ACTIVE',
      role: 'EMPLOYEE',
      AND: [responsibilityWhere('RISK_OWNER')],
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
    return prisma
      .$transaction(
        async (database) => {
          await database.$queryRaw`SELECT id FROM users WHERE id = ${input.ownerUserId}::uuid FOR SHARE`;
          const owner = await database.users.findFirst({
            where: { id: input.ownerUserId, role: 'EMPLOYEE', AND: [responsibilityWhere('RISK_OWNER')] },
            select: { id: true },
          });
          if (!owner)
            throw new AppError(422, 'INVALID_RISK_OWNER', 'Select an active Employee with Risk Owner responsibility');
          if (input.scope.type === 'business_service') {
            const service = await database.business_services.findFirst({
              where: { id: input.scope.businessServiceId, status: 'ACTIVE' },
              select: { id: true },
            });
            if (!service)
              throw new AppError(
                422,
                'INVALID_ASSESSMENT_SCOPE',
                'Select an active business service',
              );
          }
          const assets = await database.assets.findMany({
            where: {
              id: { in: assetIds },
              status: 'ACTIVE',
              ...(input.scope.type === 'business_service'
                ? { business_service_id: input.scope.businessServiceId }
                : {}),
            },
            select: { id: true },
          });
          if (!assets.length || assets.length !== assetIds.length)
            throw new AppError(
              409,
              'RISK_SCOPE_CHANGED',
              'The selected scope changed. Reload options and try again.',
            );
          return database.risks.create({
            data: {
              scope_type: input.scope.type === 'asset' ? 'ASSET' : 'BUSINESS_SERVICE',
              business_service_id:
                input.scope.type === 'business_service' ? input.scope.businessServiceId : null,
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
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
          throw new AppError(
            409,
            'RISK_SCOPE_CHANGED',
            'The selected scope changed. Reload options and try again.',
          );
        throw error;
      });
  },
  findOwner(userId: string) {
    return prisma.users.findFirst({
      where: { id: userId, role: 'EMPLOYEE', AND: [responsibilityWhere('RISK_OWNER')] },
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
  identifyThreat(riskId: string, actorId: string, input: IdentifyThreatBody) {
    return prisma.$transaction(
      async (database) => {
        await database.$queryRaw`SELECT id FROM risks WHERE id = ${riskId}::uuid FOR UPDATE`;
        const risk = await database.risks.findUnique({
          where: { id: riskId },
          select: {
            id: true,
            status: true,
            risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 },
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
        const blockedReason = vulnerabilityBlockedReason(risk.status, risk.risk_acceptances.length > 0);
        if (blockedReason) return { kind: 'context_locked' as const, blockedReason };
        if (risk.risk_threats.length) return { kind: 'duplicate' as const };
        if (risk.risk_vulnerabilities.length !== input.vulnerabilityIds.length)
          return { kind: 'invalid_vulnerabilities' as const };
        const threat = await database.risk_threats.create({
          data: {
            risk_id: riskId,
            updated_by: actorId,
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
            updated_at: true,
            risk_threat_vulnerabilities: {
              select: { risk_vulnerabilities: { select: { id: true, name: true } } },
            },
          },
        });
        const auditId = randomUUID();
        await database.audit_logs.create({
          data: {
            id: auditId,
            actor_type: 'USER',
            actor_user_id: actorId,
            action: 'RISK_THREAT_CREATED',
            resource_type: 'RISK',
            resource_id: riskId,
            source: 'API',
            before_data: Prisma.JsonNull,
            after_data: {
              id: threat.id,
              name: threat.name,
              description: threat.description,
              vulnerabilityIds: input.vulnerabilityIds,
            },
            record_hash: createHash('sha256')
              .update(JSON.stringify({ auditId, actorId, riskId, threatId: threat.id }))
              .digest('hex'),
          },
        });
        return { kind: 'created' as const, threat };
      },
      { timeout: 15_000 },
    );
  },
  updateThreat(riskId: string, threatId: string, actorId: string, input: UpdateThreatBody) {
    return prisma.$transaction(
      async (database) => {
        await database.$queryRaw`SELECT id FROM risks WHERE id = ${riskId}::uuid FOR UPDATE`;
        const risk = await database.risks.findUnique({
          where: { id: riskId },
          select: {
            id: true,
            status: true,
            risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 },
          },
        });
        if (!risk) return { kind: 'risk_not_found' as const };
        const blockedReason = vulnerabilityBlockedReason(
          risk.status,
          risk.risk_acceptances.length > 0,
        );
        if (blockedReason) return { kind: 'context_locked' as const, blockedReason };
        const current = await database.risk_threats.findFirst({
          where: { id: threatId, risk_id: riskId },
          select: {
            id: true,
            name: true,
            description: true,
            updated_at: true,
            risk_threat_vulnerabilities: {
              select: { risk_vulnerabilities: { select: { id: true, name: true } } },
            },
          },
        });
        if (!current) return { kind: 'threat_not_found' as const };
        if (current.updated_at.toISOString() !== input.expectedUpdatedAt)
          return { kind: 'stale' as const };
        const duplicate = await database.risk_threats.findFirst({
          where: {
            risk_id: riskId,
            id: { not: threatId },
            name: { equals: input.name, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (duplicate) return { kind: 'duplicate' as const };
        const vulnerabilities = await database.risk_vulnerabilities.findMany({
          where: { risk_id: riskId, id: { in: input.vulnerabilityIds } },
          select: { id: true },
        });
        if (vulnerabilities.length !== input.vulnerabilityIds.length)
          return { kind: 'invalid_vulnerabilities' as const };
        await database.risk_threat_vulnerabilities.deleteMany({
          where: {
            threat_id: threatId,
            vulnerability_id: { notIn: input.vulnerabilityIds },
          },
        });
        await database.risk_threat_vulnerabilities.createMany({
          data: input.vulnerabilityIds.map((vulnerability_id) => ({
            threat_id: threatId,
            vulnerability_id,
          })),
          skipDuplicates: true,
        });
        const changedAt = await contextWriteTime(database);
        const threat = await database.risk_threats.update({
          where: { id: threatId },
          data: {
            name: input.name,
            description: input.description,
            updated_at: changedAt,
            updated_by: actorId,
          },
          select: {
            id: true,
            name: true,
            description: true,
            created_at: true,
            updated_at: true,
            risk_threat_vulnerabilities: {
              select: { risk_vulnerabilities: { select: { id: true, name: true } } },
            },
          },
        });
        await database.risks.update({ where: { id: riskId }, data: { updated_at: changedAt } });
        const auditId = randomUUID();
        await database.audit_logs.create({
          data: {
            id: auditId,
            actor_type: 'USER',
            actor_user_id: actorId,
            action: 'RISK_THREAT_UPDATED',
            resource_type: 'RISK',
            resource_id: riskId,
            source: 'API',
            before_data: {
              id: threatId,
              name: current.name,
              description: current.description,
              vulnerabilityIds: current.risk_threat_vulnerabilities.map(
                ({ risk_vulnerabilities }) => risk_vulnerabilities.id,
              ),
            },
            after_data: {
              id: threatId,
              name: threat.name,
              description: threat.description,
              vulnerabilityIds: input.vulnerabilityIds,
            },
            record_hash: createHash('sha256')
              .update(JSON.stringify({ auditId, actorId, riskId, threatId, changedAt }))
              .digest('hex'),
          },
        });
        return { kind: 'updated' as const, threat };
      },
      { timeout: 15_000 },
    );
  },
  identifyVulnerability(riskId: string, actorId: string, input: IdentifyVulnerabilityBody) {
    return prisma.$transaction(
      async (database) => {
        // Serialize context changes with submission and approval of the same risk.
        await database.$queryRaw`SELECT id FROM risks WHERE id = ${riskId}::uuid FOR UPDATE`;
        const risk = await database.risks.findUnique({
          where: { id: riskId },
          select: {
            id: true,
            status: true,
            risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 },
            risk_vulnerabilities: {
              where: { name: { equals: input.name, mode: 'insensitive' } },
              select: { id: true },
              take: 1,
            },
          },
        });
        if (!risk) return { kind: 'risk_not_found' as const };
        const blockedReason = vulnerabilityBlockedReason(
          risk.status,
          risk.risk_acceptances.length > 0,
        );
        if (blockedReason) return { kind: 'context_locked' as const, blockedReason };
        if (risk.risk_vulnerabilities.length) return { kind: 'duplicate' as const };
        const controls = await database.security_controls.findMany({
          where: { id: { in: input.controlIds }, applicability: { not: 'NOT_APPLICABLE' } },
          select: { id: true },
        });
        if (controls.length !== input.controlIds.length)
          return { kind: 'invalid_controls' as const };
        await database.control_risk_links.createMany({
          data: input.controlIds.map((control_id) => ({ control_id, risk_id: riskId })),
          skipDuplicates: true,
        });
        const changedAt = await contextWriteTime(database);
        const vulnerability = await database.risk_vulnerabilities.create({
          data: {
            risk_id: riskId,
            created_at: changedAt,
            updated_at: changedAt,
            updated_by: actorId,
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
            updated_at: true,
            risk_vulnerability_controls: {
              select: {
                security_controls: { select: { id: true, control_code: true, name: true } },
              },
            },
          },
        });
        await database.risks.update({ where: { id: riskId }, data: { updated_at: new Date() } });
        const auditId = randomUUID();
        await database.audit_logs.create({
          data: {
            id: auditId,
            actor_type: 'USER',
            actor_user_id: actorId,
            action: 'RISK_VULNERABILITY_CREATED',
            resource_type: 'RISK',
            resource_id: riskId,
            source: 'API',
            before_data: Prisma.JsonNull,
            after_data: {
              id: vulnerability.id,
              name: vulnerability.name,
              description: vulnerability.description,
              controlIds: input.controlIds,
            },
            record_hash: createHash('sha256')
              .update(
                JSON.stringify({ auditId, actorId, riskId, vulnerabilityId: vulnerability.id }),
              )
              .digest('hex'),
          },
        });
        return { kind: 'created' as const, vulnerability };
      },
      { timeout: 15_000 },
    );
  },
  updateVulnerability(
    riskId: string,
    vulnerabilityId: string,
    actorId: string,
    input: UpdateVulnerabilityBody,
  ) {
    return prisma.$transaction(
      async (database) => {
        await database.$queryRaw`SELECT id FROM risks WHERE id = ${riskId}::uuid FOR UPDATE`;
        const risk = await database.risks.findUnique({
          where: { id: riskId },
          select: {
            id: true,
            status: true,
            risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 },
          },
        });
        if (!risk) return { kind: 'risk_not_found' as const };
        const blockedReason = vulnerabilityBlockedReason(
          risk.status,
          risk.risk_acceptances.length > 0,
        );
        if (blockedReason) return { kind: 'context_locked' as const, blockedReason };

        const current = await database.risk_vulnerabilities.findFirst({
          where: { id: vulnerabilityId, risk_id: riskId },
          select: {
            id: true,
            name: true,
            description: true,
            updated_at: true,
            risk_vulnerability_controls: { select: { control_id: true } },
          },
        });
        if (!current) return { kind: 'vulnerability_not_found' as const };
        if (current.updated_at.toISOString() !== input.expectedUpdatedAt)
          return { kind: 'stale' as const };

        const duplicate = await database.risk_vulnerabilities.findFirst({
          where: {
            risk_id: riskId,
            id: { not: vulnerabilityId },
            name: { equals: input.name, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (duplicate) return { kind: 'duplicate' as const };

        const controls = await database.security_controls.findMany({
          where: { id: { in: input.controlIds }, applicability: { not: 'NOT_APPLICABLE' } },
          select: { id: true },
        });
        if (controls.length !== input.controlIds.length)
          return { kind: 'invalid_controls' as const };

        await database.control_risk_links.createMany({
          data: input.controlIds.map((control_id) => ({ control_id, risk_id: riskId })),
          skipDuplicates: true,
        });
        await database.risk_vulnerability_controls.deleteMany({
          where: {
            vulnerability_id: vulnerabilityId,
            ...(input.controlIds.length ? { control_id: { notIn: input.controlIds } } : {}),
          },
        });
        await database.risk_vulnerability_controls.createMany({
          data: input.controlIds.map((control_id) => ({
            vulnerability_id: vulnerabilityId,
            control_id,
          })),
          skipDuplicates: true,
        });

        const changedAt = await contextWriteTime(database);
        const vulnerability = await database.risk_vulnerabilities.update({
          where: { id: vulnerabilityId },
          data: {
            name: input.name,
            description: input.description,
            updated_at: changedAt,
            updated_by: actorId,
          },
          select: {
            id: true,
            name: true,
            description: true,
            created_at: true,
            updated_at: true,
            risk_vulnerability_controls: {
              select: {
                security_controls: { select: { id: true, control_code: true, name: true } },
              },
            },
          },
        });
        await database.risks.update({ where: { id: riskId }, data: { updated_at: changedAt } });
        const auditId = randomUUID();
        await database.audit_logs.create({
          data: {
            id: auditId,
            actor_type: 'USER',
            actor_user_id: actorId,
            action: 'RISK_VULNERABILITY_UPDATED',
            resource_type: 'RISK',
            resource_id: riskId,
            source: 'API',
            before_data: {
              id: vulnerabilityId,
              name: current.name,
              description: current.description,
              controlIds: current.risk_vulnerability_controls.map((item) => item.control_id),
            },
            after_data: {
              id: vulnerabilityId,
              name: vulnerability.name,
              description: vulnerability.description,
              controlIds: input.controlIds,
            },
            record_hash: createHash('sha256')
              .update(JSON.stringify({ auditId, actorId, riskId, vulnerabilityId, changedAt }))
              .digest('hex'),
          },
        });
        return { kind: 'updated' as const, vulnerability };
      },
      { timeout: 15_000 },
    );
  },
  vulnerabilityControlOptions(riskId: string, q: string, limit: number) {
    return prisma.security_controls.findMany({
      where: {
        applicability: { not: 'NOT_APPLICABLE' },
        ...(q
          ? {
              OR: [
                { control_code: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        control_code: true,
        name: true,
        applicability: true,
        implementation_status: true,
        control_risk_links: { where: { risk_id: riskId }, select: { risk_id: true }, take: 1 },
      },
      orderBy: { control_code: 'asc' },
      take: limit,
    });
  },
  assessInherentRisk(riskId: string, actorId: string, input: AssessInherentRiskBody) {
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT id FROM risks WHERE id = ${riskId}::uuid FOR UPDATE`;
      const risk = await database.risks.findUnique({
        where: { id: riskId },
        select: {
          id: true,
          risk_code: true,
          title: true,
          status: true,
          review_date: true,
          risk_assessments: {
            where: {
              inherent_likelihood: { not: null },
              inherent_impact: { not: null },
              inherent_rating: { not: null },
            },
            select: { id: true, inherent_rating: true, assessment_reason: true },
            orderBy: { assessed_at: 'desc' },
            take: 1,
          },
          _count: { select: { risk_assets: true, risk_threats: true, risk_vulnerabilities: true } },
        },
      });
      if (!risk) return { kind: 'risk_not_found' as const };
      if (!['OPEN', 'UNDER_TREATMENT'].includes(risk.status))
        return { kind: 'context_locked' as const };
      if (
        !risk._count.risk_assets ||
        !risk._count.risk_threats ||
        !risk._count.risk_vulnerabilities
      )
        return { kind: 'incomplete_context' as const };
      const score = input.likelihood * input.impact;
      const rating = score <= 4 ? 'LOW' : score <= 9 ? 'MEDIUM' : score <= 16 ? 'HIGH' : 'CRITICAL';
      const previousAssessment = risk.risk_assessments[0];
      const ratingRank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
      const isMajorReduction =
        previousAssessment?.inherent_rating != null &&
        ratingRank[previousAssessment.inherent_rating] - ratingRank[rating] >= 2;
      if (isMajorReduction && input.assessmentReason.trim().length < 30)
        return { kind: 'major_change_reason_required' as const };
      const normalizeReason = (value: string | null) =>
        value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ?? '';
      if (
        isMajorReduction &&
        normalizeReason(input.assessmentReason) ===
          normalizeReason(previousAssessment.assessment_reason)
      )
        return { kind: 'major_change_reason_unchanged' as const };
      const assessedAt = await contextWriteTime(database);
      const assessment = await database.risk_assessments.create({
        data: {
          risk_id: riskId,
          assessment_type: risk.risk_assessments.length ? 'PERIODIC_REVIEW' : 'INITIAL',
          inherent_likelihood: input.likelihood,
          assessed_at: assessedAt,
          inherent_impact: input.impact,
          inherent_rating: rating,
          assessment_reason: input.assessmentReason,
          assessed_by: actorId,
          review_date: currentOrFutureReviewDate(risk.review_date, assessedAt),
          methodology_version: 'SECURAAI-RISK-MATRIX-v1',
        },
        select: { id: true, assessment_type: true, assessed_at: true, methodology_version: true },
      });
      return { kind: 'created' as const, assessment, risk, score, rating };
    });
  },
  assessResidualRisk(riskId: string, actorId: string, input: AssessResidualRiskBody) {
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT id FROM risks WHERE id = ${riskId}::uuid FOR UPDATE`;
      await database.$queryRaw`
        SELECT control.id FROM security_controls AS control
        JOIN control_risk_links AS link ON link.control_id = control.id
        WHERE link.risk_id = ${riskId}::uuid
        ORDER BY control.id FOR SHARE OF control
      `;
      const risk = await database.risks.findUnique({
        where: { id: riskId },
        select: {
          id: true,
          risk_code: true,
          title: true,
          owner_user_id: true,
          status: true,
          risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 },
          risk_threats: { select: { created_at: true, updated_at: true } },
          review_date: true,
          risk_vulnerabilities: {
            select: { created_at: true, updated_at: true },
          },
          risk_assessments: {
            where: {
              inherent_likelihood: { not: null },
              inherent_impact: { not: null },
              inherent_rating: { not: null },
              OR: [
                { residual_likelihood: null, residual_impact: null, residual_rating: null },
                { assessment_type: 'INCIDENT_REASSESSMENT' },
              ],
            },
            orderBy: { assessed_at: 'desc' },
            take: 1,
            select: {
              inherent_likelihood: true,
              inherent_impact: true,
              inherent_rating: true,
              risk_appetite: true,
              risk_tolerance: true,
              assessed_at: true,
            },
          },
          control_risk_links: {
            select: {
              security_controls: {
                select: {
                  id: true,
                  implementation_status: true,
                  applicability: true,
                  updated_at: true,
                  control_evidence_links: {
                    select: { linked_at: true, evidence_items: { select: {
                      id: true, status: true, collected_at: true, valid_from: true, valid_until: true,
                    } } },
                  },
                  control_assessments: {
                    where: { effectiveness: { not: null } },
                    orderBy: { assessed_at: 'desc' },
                    take: 1,
                    select: { id: true, effectiveness: true, assessed_at: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!risk) return { kind: 'risk_not_found' as const };
      if (risk.owner_user_id !== actorId) return { kind: 'not_owner' as const };
      if (!['OPEN', 'UNDER_TREATMENT'].includes(risk.status) || risk.risk_acceptances.length)
        return { kind: 'context_locked' as const };
      const inherent = risk.risk_assessments[0];
      if (!inherent) return { kind: 'inherent_required' as const };
      if (assessmentRequiresReview(inherent.assessed_at, [...risk.risk_vulnerabilities, ...risk.risk_threats]))
        return { kind: 'context_changed' as const };
      const establishedThresholds = await database.risk_assessments.findFirst({
        where: { risk_id: riskId, risk_appetite: { not: null }, risk_tolerance: { not: null } },
        orderBy: { assessed_at: 'desc' },
        select: { risk_appetite: true, risk_tolerance: true },
      });
      if (
        (establishedThresholds?.risk_appetite && establishedThresholds.risk_appetite.toLowerCase() !== input.riskAppetite) ||
        (establishedThresholds?.risk_tolerance && establishedThresholds.risk_tolerance.toLowerCase() !== input.riskTolerance)
      ) return { kind: 'thresholds_changed' as const };
      const controlsBlocked = validateResidualControls(risk.control_risk_links);
      if (controlsBlocked === 'control_assessments_required') return { kind: 'control_assessments_required' as const };
      if (controlsBlocked === 'control_assessments_stale') return { kind: 'control_assessments_stale' as const };
      const values = risk.control_risk_links.map(
        ({ security_controls }) =>
          security_controls.control_assessments[0]?.effectiveness?.toNumber() ?? 0,
      );
      const controlEffectiveness = values.reduce((sum, value) => sum + value, 0) / values.length;
      const score = input.likelihood * input.impact;
      const rating = score <= 4 ? 'LOW' : score <= 9 ? 'MEDIUM' : score <= 16 ? 'HIGH' : 'CRITICAL';
      const assessedAt = await contextWriteTime(database);
      const assessment = await database.risk_assessments.create({
        data: {
          risk_id: riskId,
          assessment_type: 'PERIODIC_REVIEW',
          inherent_likelihood: inherent.inherent_likelihood,
          assessed_at: assessedAt,
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
          review_date: currentOrFutureReviewDate(risk.review_date, assessedAt),
        },
        select: { id: true, assessed_at: true },
      });
      const auditId = randomUUID();
      const controlBasis = risk.control_risk_links.map(({ security_controls: control }) => ({
        controlId: control.id,
        assessmentId: control.control_assessments[0]?.id ?? null,
        effectiveness: control.control_assessments[0]?.effectiveness?.toNumber() ?? null,
        assessedAt: control.control_assessments[0]?.assessed_at.toISOString() ?? null,
        implementationStatus: control.implementation_status,
        linkedEvidenceIds: control.control_evidence_links.map((link) => link.evidence_items.id),
      }));
      const auditData = { assessmentId: assessment.id, score, rating, controlBasis };
      await database.audit_logs.create({ data: {
        id: auditId, actor_type: 'USER', actor_user_id: actorId,
        action: 'RISK_RESIDUAL_ASSESSED', resource_type: 'RISK', resource_id: riskId,
        source: 'API', after_data: auditData,
        record_hash: createHash('sha256').update(JSON.stringify({ auditId, actorId, ...auditData })).digest('hex'),
      } });
      return { kind: 'created' as const, risk, assessment, score, rating, controlEffectiveness };
    });
  },
  defineTargetRisk(riskId: string, actorId: string, input: DefineTargetRiskBody) {
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT id FROM risks WHERE id = ${riskId}::uuid FOR UPDATE`;
      const risk = await database.risks.findUnique({
        where: { id: riskId },
        select: {
          id: true,
          risk_code: true,
          title: true,
          owner_user_id: true,
          status: true,
          risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 },
          risk_threats: { select: { created_at: true, updated_at: true } },
          review_date: true,
          risk_vulnerabilities: {
            select: { created_at: true, updated_at: true },
          },
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
      if (!['OPEN', 'UNDER_TREATMENT'].includes(risk.status) || risk.risk_acceptances.length)
        return { kind: 'context_locked' as const };
      const current = risk.risk_assessments[0];
      if (!current) return { kind: 'residual_required' as const };
      if (assessmentRequiresReview(current.assessed_at, [...risk.risk_vulnerabilities, ...risk.risk_threats]))
        return { kind: 'context_changed' as const };
      const plan = risk.risk_treatment_plans[0];
      if (!plan) return { kind: 'plan_required' as const };
      const rank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
      const target = input.targetRisk.toUpperCase() as keyof typeof rank;
      if (rank[target] > rank[current.residual_rating!])
        return { kind: 'target_exceeds_residual' as const };
      const assessedAt = await contextWriteTime(database);
      const assessment = await database.risk_assessments.create({
        data: {
          risk_id: riskId,
          assessment_type: 'TARGET_DEFINITION',
          target_risk: target,
          risk_appetite: current.risk_appetite,
          risk_tolerance: current.risk_tolerance,
          assessment_reason: input.rationale,
          methodology_version: current.methodology_version,
          assessed_by: actorId,
          assessed_at: assessedAt,
          review_date: currentOrFutureReviewDate(risk.review_date, assessedAt),
        },
        select: { id: true, assessed_at: true },
      });
      await database.risk_treatment_plans.update({
        where: { id: plan.id },
        data: { source_assessment_id: assessment.id },
      });
      const auditId = randomUUID();
      const targetData = {
        assessmentId: assessment.id, treatmentPlanId: plan.id, treatmentPlanTitle: plan.title,
        residualAssessmentId: current.id, residualAssessedAt: current.assessed_at.toISOString(),
        residualRating: current.residual_rating, targetRisk: target,
        riskAppetite: current.risk_appetite, riskTolerance: current.risk_tolerance,
      };
      await database.audit_logs.create({ data: {
        id: auditId, actor_type: 'USER', actor_user_id: actorId, action: 'RISK_TARGET_DEFINED',
        resource_type: 'RISK', resource_id: riskId, source: 'API', after_data: targetData,
        record_hash: createHash('sha256').update(JSON.stringify({ auditId, actorId, ...targetData })).digest('hex'),
      } });
      return { kind: 'created' as const, risk, current, plan, assessment, target };
    });
  },
  treatmentPlanOptions(riskId: string | undefined, q: string, limit: number) {
    return prisma.$transaction([
      prisma.users.findMany({
        where: {
          status: 'ACTIVE',
          ...(q
            ? {
                OR: [
                  { full_name: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: { id: true, full_name: true, email: true },
        orderBy: { full_name: 'asc' },
        take: limit,
      }),
      prisma.security_controls.findMany({
        where: {
          ...(riskId ? { control_risk_links: { some: { risk_id: riskId } } } : {}),
          applicability: { not: 'NOT_APPLICABLE' },
          ...(q
            ? {
                OR: [
                  { control_code: { contains: q, mode: 'insensitive' } },
                  { name: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: { id: true, control_code: true, name: true, implementation_status: true },
        orderBy: { control_code: 'asc' },
        take: limit,
      }),
    ]);
  },
  findTreatmentPlanScope(riskId: string) {
    return prisma.risks.findUnique({ where: { id: riskId }, select: { owner_user_id: true } });
  },
  createTreatmentPlan(actorId: string, input: CreateTreatmentPlanBody) {
    return prisma
      .$transaction(
        async (database) => {
          await database.$queryRaw`SELECT id FROM risks WHERE id = ${input.riskId}::uuid FOR UPDATE`;
          const risk = await database.risks.findUnique({
            where: { id: input.riskId },
            select: {
              id: true,
              risk_code: true,
              owner_user_id: true,
              status: true,
              risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 },
              review_date: true,
              risk_assessments: { where: { assessment_type: { not: 'TARGET_DEFINITION' } }, orderBy: { assessed_at: 'desc' }, take: 1 },
              risk_treatment_plans: {
                where: { status: { in: ['DRAFT', 'ACTIVE'] } },
                select: { id: true },
                take: 1,
              },
              control_risk_links: {
                where: { control_id: { in: input.controlIds }, security_controls: { applicability: { not: 'NOT_APPLICABLE' } } },
                select: { control_id: true },
              },
            },
          });
          if (!risk) return { kind: 'risk_not_found' as const };
          const actor = await database.users.findUnique({
            where: { id: actorId },
            select: { role: true },
          });
          if (actor?.role !== 'SECURITY_OFFICER' && risk.owner_user_id !== actorId)
            return { kind: 'forbidden' as const };
          if (!['OPEN', 'UNDER_TREATMENT'].includes(risk.status) || risk.risk_acceptances.length)
            return { kind: 'context_locked' as const };
          if (risk.risk_treatment_plans.length) return { kind: 'active_plan_exists' as const };
          const users = await database.users.count({
            where: {
              id: {
                in: [input.ownerUserId, ...input.actions.map((item) => item.assignedToUserId)],
              },
              status: 'ACTIVE',
            },
          });
          if (
            users !==
            new Set([input.ownerUserId, ...input.actions.map((item) => item.assignedToUserId)]).size
          )
            return { kind: 'invalid_users' as const };
          const controls = risk.control_risk_links;
          if (controls.length !== input.controlIds.length)
            return { kind: 'invalid_controls' as const };
          const latest = await database.risk_assessments.findFirst({
            where: { risk_id: risk.id, residual_rating: { not: null }, assessment_type: { not: 'TARGET_DEFINITION' } },
            orderBy: { assessed_at: 'desc' },
          }) ?? risk.risk_assessments[0];
          const rank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
          const targetRating = input.targetRisk.toUpperCase() as keyof typeof rank;
          if (latest?.residual_rating && rank[targetRating] > rank[latest.residual_rating])
            return { kind: 'target_exceeds_residual' as const };
          const assessedAt = await contextWriteTime(database);
          const source = await database.risk_assessments.create({
            data: {
              risk_id: risk.id,
              assessment_type: 'TARGET_DEFINITION',
              target_risk: input.targetRisk.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
              risk_appetite: latest?.risk_appetite ?? null,
              risk_tolerance: latest?.risk_tolerance ?? null,
              assessment_reason: `Treatment plan: ${input.title}`,
              assessed_by: actorId,
              assessed_at: assessedAt,
              review_date: currentOrFutureReviewDate(risk.review_date, assessedAt),
            },
            select: { id: true },
          });
          const plan = await database.risk_treatment_plans.create({
            data: {
              risk_id: risk.id,
              source_assessment_id: source.id,
              title: input.title,
              acceptance_cost_basis: input.acceptanceCost ?? Prisma.DbNull,
              strategy: input.strategy.toUpperCase() as
                'AVOID' | 'MITIGATE' | 'TRANSFER' | 'ACCEPT',
              owner_user_id: input.ownerUserId,
              target_completion_date: new Date(`${input.targetDate}T00:00:00.000Z`),
              created_by: actorId,
              risk_treatment_plan_controls: {
                create: input.controlIds.map((control_id) => ({ control_id, linked_by: actorId })),
              },
              risk_treatment_actions: {
                create: input.actions.map((item) => ({
                  action_description: item.description
                    ? `${item.title}: ${item.description}`
                    : item.title,
                  owner_user_id: item.assignedToUserId,
                  due_date: new Date(`${item.dueDate}T00:00:00.000Z`),
                })),
              },
            },
            select: {
              id: true,
              title: true,
              strategy: true,
              status: true,
              target_completion_date: true,
              created_at: true,
            },
          });
          const auditId = randomUUID();
          const auditData = { assessmentId: source.id, treatmentPlanId: plan.id, treatmentPlanTitle: plan.title,
            residualAssessmentId: latest?.residual_rating ? latest.id : null,
            residualAssessedAt: latest?.residual_rating ? latest.assessed_at.toISOString() : null,
            residualRating: latest?.residual_rating ?? null, targetRisk: targetRating,
            strategy: input.strategy, acceptanceCost: input.acceptanceCost ?? null, ownerUserId: input.ownerUserId, controlIds: input.controlIds, actions: input.actions };
          await database.audit_logs.create({ data: { id: auditId, actor_type: 'USER', actor_user_id: actorId,
            action: 'RISK_TARGET_DEFINED', resource_type: 'RISK', resource_id: risk.id, source: 'API', after_data: auditData,
            record_hash: createHash('sha256').update(JSON.stringify({ auditId, actorId, ...auditData })).digest('hex') } });
          return {
            kind: 'created' as const,
            plan,
            riskCode: risk.risk_code,
            actionCount: input.actions.length,
            controlCount: controls.length,
            targetRisk: input.targetRisk,
          };
        },
        { maxWait: 10_000, timeout: 15_000 },
      )
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          return { kind: 'active_plan_exists' as const };
        throw error;
      });
  },
  updateTreatmentPlan(planId: string, actorId: string, input: UpdateTreatmentPlanBody) {
    return prisma.$transaction(
      async (database) => {
        const target = await database.risk_treatment_plans.findUnique({ where: { id: planId }, select: { risk_id: true } });
        if (!target) return { kind: 'not_found' as const };
        await database.$queryRaw`SELECT id FROM risks WHERE id = ${target.risk_id}::uuid FOR UPDATE`;
        await database.$queryRaw`SELECT id FROM risk_treatment_plans WHERE id = ${planId}::uuid FOR UPDATE`;
        const plan = await database.risk_treatment_plans.findUnique({
          where: { id: planId },
          include: {
            risks: { select: { id: true, owner_user_id: true, risk_code: true, status: true } },
            risk_treatment_actions: true,
            risk_treatment_plan_controls: true,
          },
        });
        if (!plan) return { kind: 'not_found' as const };
        if (['COMPLETED', 'CANCELLED'].includes(plan.status))
          return { kind: 'terminal_plan' as const };
        if (['ACCEPTED', 'CLOSED', 'ARCHIVED'].includes(plan.risks.status))
          return { kind: 'terminal_risk' as const };
        if (
          (plan.status === 'DRAFT' && input.status === 'completed') ||
          (plan.status === 'ACTIVE' && input.status === 'draft')
        )
          return { kind: 'invalid_status_transition' as const };
        const actor = await database.users.findUnique({
          where: { id: actorId },
          select: { role: true },
        });
        if (actor?.role !== 'SECURITY_OFFICER' && plan.risks.owner_user_id !== actorId)
          return { kind: 'forbidden' as const };
        if (plan.updated_at.toISOString() !== input.expectedUpdatedAt)
          return { kind: 'conflict' as const };
        if (await database.risk_acceptances.count({ where: { risk_id: plan.risks.id, decision: 'PENDING' } }))
          return { kind: 'pending_acceptance' as const };
        if (input.status === 'completed' && input.strategy !== 'accept' && !input.actions.some((item) => item.status === 'completed'))
          return { kind: 'no_completed_actions' as const };
        if (
          input.status === 'completed' &&
          input.actions.some((item) => !['completed', 'cancelled'].includes(item.status))
        )
          return { kind: 'incomplete_actions' as const };
        const userIds = [
          ...new Set([input.ownerUserId, ...input.actions.map((item) => item.assignedToUserId)]),
        ];
        if (
          (await database.users.count({ where: { id: { in: userIds }, status: 'ACTIVE' } })) !==
          userIds.length
        )
          return { kind: 'invalid_users' as const };
        const existing = new Map(plan.risk_treatment_actions.map((item) => [item.id, item]));
        if (input.targetDate < plan.created_at.toISOString().slice(0, 10) || input.actions.some((item) => {
          const prior = item.id ? existing.get(item.id) : undefined;
          return item.dueDate < (prior?.created_at ?? new Date()).toISOString().slice(0, 10);
        })) return { kind: 'invalid_dates' as const };
        if (input.actions.some((item) => {
          const prior = item.id ? existing.get(item.id) : undefined;
          if (!prior) return false;
          if (['COMPLETED', 'CANCELLED'].includes(prior.status))
            return item.status.toUpperCase() !== prior.status || item.title !== prior.action_description ||
              item.assignedToUserId !== prior.owner_user_id || item.dueDate !== prior.due_date?.toISOString().slice(0, 10);
          return prior.status === 'IN_PROGRESS' && item.status === 'pending';
        })) return { kind: 'invalid_action_transition' as const };
        if (input.actions.some((item) => item.id && !existing.has(item.id)))
          return { kind: 'invalid_actions' as const };
        const riskControls = await database.control_risk_links.count({
          where: { risk_id: plan.risks.id, control_id: { in: input.controlIds } },
        });
        if (riskControls !== input.controlIds.length) return { kind: 'invalid_controls' as const };
        const currentControlIds = new Set(
          plan.risk_treatment_plan_controls.map((item) => item.control_id),
        );
        if (
          plan.status === 'ACTIVE' &&
          [...currentControlIds].some((id) => !input.controlIds.includes(id))
        )
          return { kind: 'active_control_removal' as const };
        const supplied = new Set(input.actions.flatMap((item) => (item.id ? [item.id] : [])));
        if (
          plan.risk_treatment_actions.some(
            (item) => !supplied.has(item.id) && item.status !== 'PENDING',
          )
        )
          return { kind: 'started_action_removed' as const };
        await database.risk_treatment_actions.deleteMany({
          where: { treatment_plan_id: planId, status: 'PENDING', id: { notIn: [...supplied] } },
        });
        for (const item of input.actions) {
          const data = {
            action_description: item.title,
            owner_user_id: item.assignedToUserId,
            due_date: new Date(`${item.dueDate}T00:00:00.000Z`),
            status: item.status.toUpperCase() as
              'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
            completed_at: item.status === 'completed' ? (item.id ? existing.get(item.id)?.completed_at : null) ?? new Date() : null,
            updated_at: new Date(),
          };
          if (item.id)
            await database.risk_treatment_actions.update({ where: { id: item.id }, data });
          else
            await database.risk_treatment_actions.create({
              data: { ...data, treatment_plan_id: planId },
            });
        }
        await database.risk_treatment_plan_controls.deleteMany({
          where: { treatment_plan_id: planId, control_id: { notIn: input.controlIds } },
        });
        await database.risk_treatment_plan_controls.createMany({
          data: input.controlIds
            .filter((id) => !currentControlIds.has(id))
            .map((control_id) => ({ treatment_plan_id: planId, control_id, linked_by: actorId })),
          skipDuplicates: true,
        });
        const updated = await database.risk_treatment_plans.update({
          where: { id: planId },
          data: {
            title: input.title,
            acceptance_cost_basis: input.acceptanceCost ?? Prisma.DbNull,
            strategy: input.strategy.toUpperCase() as 'AVOID' | 'MITIGATE' | 'TRANSFER' | 'ACCEPT',
            owner_user_id: input.ownerUserId,
            target_completion_date: new Date(`${input.targetDate}T00:00:00.000Z`),
            status: input.status.toUpperCase() as 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED',
            updated_at: new Date(),
          },
          include: {
            risk_treatment_actions: { orderBy: { created_at: 'asc' } },
            risk_treatment_plan_controls: {
              include: { security_controls: true },
              orderBy: { linked_at: 'asc' },
            },
          },
        });
        let riskStatus = plan.risks.status;
        if (input.status === 'active' && riskStatus === 'OPEN') {
          const risk = await database.risks.update({
            where: { id: plan.risks.id },
            data: { status: 'UNDER_TREATMENT', updated_at: new Date() },
            select: { status: true },
          });
          riskStatus = risk.status;
        } else if (plan.status === 'ACTIVE' && input.status === 'cancelled') {
          const otherActivePlans = await database.risk_treatment_plans.count({
            where: { risk_id: plan.risks.id, id: { not: planId }, status: 'ACTIVE' },
          });
          if (otherActivePlans === 0 && riskStatus === 'UNDER_TREATMENT') {
            const risk = await database.risks.update({
              where: { id: plan.risks.id },
              data: { status: 'OPEN', updated_at: new Date() },
              select: { status: true },
            });
            riskStatus = risk.status;
          }
        }
        const auditId = randomUUID();
        const before = { title: plan.title, status: plan.status, strategy: plan.strategy, acceptanceCost: readAcceptanceCost(plan.acceptance_cost_basis), ownerUserId: plan.owner_user_id, targetDate: plan.target_completion_date?.toISOString() ?? null,
          controls: plan.risk_treatment_plan_controls.map((item) => item.control_id),
          actions: plan.risk_treatment_actions.map((item) => ({ id: item.id, title: item.action_description, status: item.status, ownerUserId: item.owner_user_id, dueDate: item.due_date?.toISOString() ?? null, completedAt: item.completed_at?.toISOString() ?? null })) };
        const after = { ...input, actions: updated.risk_treatment_actions.map((item) => ({ id: item.id, title: item.action_description, status: item.status, ownerUserId: item.owner_user_id, dueDate: item.due_date?.toISOString() ?? null, completedAt: item.completed_at?.toISOString() ?? null })) };
        await database.audit_logs.create({ data: { id: auditId, actor_type: 'USER', actor_user_id: actorId, action: 'RISK_TREATMENT_PLAN_UPDATED', resource_type: 'RISK', resource_id: plan.risks.id, source: 'API', before_data: { planId, ...before }, after_data: { planId, ...after }, record_hash: createHash('sha256').update(JSON.stringify({ auditId, actorId, before, after })).digest('hex') } });
        return {
          kind: 'updated' as const,
          updated,
          riskCode: plan.risks.risk_code,
          riskStatus,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  },
  submitAcceptance(riskId: string, actorId: string, input: SubmitRiskAcceptanceBody) {
    return prisma.$transaction(
      async (database) => {
        await database.$queryRaw`SELECT id FROM risks WHERE id = ${riskId}::uuid FOR UPDATE`;
        await database.$queryRaw`SELECT control.id FROM security_controls AS control
          JOIN control_risk_links AS link ON link.control_id = control.id
          WHERE link.risk_id = ${riskId}::uuid ORDER BY control.id FOR SHARE OF control`;
        const actor = await database.users.findUnique({ where: { id: actorId }, select: { status: true } });
        if (actor?.status !== 'ACTIVE') return { kind: 'not_owner' as const };
        const risk = await database.risks.findUnique({
          where: { id: riskId },
          select: {
            id: true,
            risk_code: true,
            status: true,
            owner_user_id: true,
            review_date: true,
            risk_threats: { select: { created_at: true, updated_at: true } },
            control_risk_links: residualControlLinks,
            risk_vulnerabilities: {
              select: { created_at: true, updated_at: true },
            },
            risk_assessments: { where: { assessment_type: { not: 'TARGET_DEFINITION' } }, orderBy: { assessed_at: 'desc' }, take: 1 },
            risk_treatment_plans: {
              where: {
                id: input.treatmentPlanId,
                status: { in: ['DRAFT', 'ACTIVE', 'COMPLETED'] },
              },
              select: {
                id: true,
                status: true,
                updated_at: true,
                strategy: true,
                acceptance_cost_basis: true,
                risk_treatment_actions: { select: { status: true } },
                risk_assessments: { select: { target_risk: true } },
              },
            },
            risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 },
          },
        });
        if (!risk) return { kind: 'not_found' as const };
        if (risk.owner_user_id !== actorId) return { kind: 'not_owner' as const };
        if (!['OPEN', 'UNDER_TREATMENT'].includes(risk.status))
          return { kind: 'context_locked' as const };
        const reviewEvents = await database.audit_logs.findMany({
          where: { resource_type: 'RISK', resource_id: riskId, outcome: 'SUCCESS',
            action: { in: ['RISK_REVIEW_OPENED', 'RISK_REVIEW_COMPLETED', 'RISK_ACCEPTANCE_DECIDED'] } },
          select: { action: true, occurred_at: true, after_data: true },
          orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        });
        if (currentRiskReview(reviewEvents)) return { kind: 'review_in_progress' as const };
        if (!risk.risk_treatment_plans[0]) return { kind: 'invalid_plan' as const };
        const selectedPlan = risk.risk_treatment_plans[0];
        if (selectedPlan.strategy === 'ACCEPT' && !readAcceptanceCost(selectedPlan.acceptance_cost_basis)) return { kind: 'acceptance_cost_required' as const };
        if (input.treatmentPlanStatus && selectedPlan.status.toLowerCase() !== input.treatmentPlanStatus)
          return { kind: 'invalid_plan_status' as const };
        if (
          selectedPlan.status === 'COMPLETED' &&
          selectedPlan.risk_treatment_actions.some(
            (item) => !['COMPLETED', 'CANCELLED'].includes(item.status),
          )
        )
          return { kind: 'incomplete_actions' as const };
        if (selectedPlan.status === 'COMPLETED' && selectedPlan.strategy !== 'ACCEPT' &&
            !selectedPlan.risk_treatment_actions.some((item) => item.status === 'COMPLETED'))
          return { kind: 'no_completed_actions' as const };
        if (risk.risk_acceptances[0]) return { kind: 'pending_exists' as const };
        const latest = risk.risk_assessments[0];
        if (
          !latest?.residual_rating ||
          assessmentRequiresReview(latest.assessed_at, [...risk.risk_vulnerabilities, ...risk.risk_threats])
        )
          return { kind: 'context_changed' as const };
        const openedReview = await database.audit_logs.findFirst({ where: { resource_type: 'RISK', resource_id: riskId, action: 'RISK_REVIEW_OPENED' }, orderBy: { occurred_at: 'desc' }, select: { occurred_at: true } });
        if (openedReview && latest.assessed_at <= openedReview.occurred_at) return { kind: 'context_changed' as const };
        const inherent = await database.risk_assessments.findFirst({
          where: { risk_id: riskId, inherent_rating: { not: null }, inherent_likelihood: { not: null }, inherent_impact: { not: null },
            OR: [{ residual_rating: null }, { assessment_type: 'INCIDENT_REASSESSMENT' }] },
          orderBy: { assessed_at: 'desc' },
        });
        if (!inherent || assessmentRequiresReview(inherent.assessed_at, [...risk.risk_vulnerabilities, ...risk.risk_threats]))
          return { kind: 'context_changed' as const };
        const controlsBlocked = validateResidualControls(risk.control_risk_links);
        if (controlsBlocked === 'control_assessments_required') return { kind: 'control_assessments_required' as const };
        if (controlsBlocked === 'control_assessments_stale') return { kind: 'control_assessments_stale' as const };
        const controlBasis = residualControlBasis(risk.control_risk_links);
        const controlEffectiveness = controlBasis.reduce((sum, item) => sum + (item.effectiveness ?? 0), 0) / controlBasis.length;
        const score = input.residualLikelihood * input.residualImpact;
        const rating =
          score <= 4 ? 'LOW' : score <= 9 ? 'MEDIUM' : score <= 16 ? 'HIGH' : 'CRITICAL';
        const assessedAt = await contextWriteTime(database);
        const assessment = await database.risk_assessments.create({
          data: {
            risk_id: riskId,
            assessment_type: 'PERIODIC_REVIEW',
            inherent_likelihood: inherent.inherent_likelihood,
            inherent_impact: inherent.inherent_impact,
            inherent_rating: inherent.inherent_rating,
            control_effectiveness: controlEffectiveness,
            residual_likelihood: input.residualLikelihood,
            residual_impact: input.residualImpact,
            residual_rating: rating,
            target_risk: selectedPlan.risk_assessments?.target_risk ?? latest?.target_risk ?? null,
            risk_appetite: latest?.risk_appetite ?? null,
            risk_tolerance: latest?.risk_tolerance ?? null,
            assessment_reason: input.assessmentReason,
            assessed_by: actorId,
            assessed_at: assessedAt,
            review_date: currentOrFutureReviewDate(risk.review_date, assessedAt),
          },
          select: { id: true, assessed_at: true },
        });
        const acceptance = await database.risk_acceptances.create({
          data: {
            risk_id: riskId,
            requested_by: actorId,
            requested_at: assessedAt,
            reason: input.acceptanceReason,
            valid_until: new Date(`${input.validUntil}T00:00:00.000Z`),
          },
          select: { id: true, decision: true, requested_at: true, valid_until: true },
        });
        const auditId = randomUUID();
        const auditData = { acceptanceId: acceptance.id, assessmentId: assessment.id,
          inherentAssessmentId: inherent.id, treatmentPlanId: selectedPlan.id,
          planUpdatedAt: selectedPlan.updated_at.toISOString(), controlBasis,
          acceptanceCost: readAcceptanceCost(selectedPlan.acceptance_cost_basis),
          acceptanceReason: input.acceptanceReason, residualScore: score, residualRating: rating,
          validUntil: input.validUntil };
        await database.audit_logs.create({ data: { id: auditId, actor_type: 'USER', actor_user_id: actorId,
          action: 'RISK_ACCEPTANCE_SUBMITTED', resource_type: 'RISK', resource_id: riskId, source: 'API', occurred_at: assessedAt,
          after_data: auditData, record_hash: createHash('sha256').update(JSON.stringify({ auditId, actorId, ...auditData })).digest('hex') } });
        return {
          kind: 'submitted' as const,
          riskCode: risk.risk_code,
          assessment,
          acceptance,
          rating,
          score,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  },
  decideAcceptance(acceptanceId: string, actorId: string, input: DecideRiskAcceptanceBody) {
    return prisma.$transaction(
      async (database) => {
        const actor = await database.users.findUnique({
          where: { id: actorId },
          select: { role: true, status: true },
        });
        if (!actor || actor.status !== 'ACTIVE' || !['SECURITY_OFFICER', 'EXECUTIVE'].includes(actor.role))
          return { kind: 'forbidden' as const };
        const target = await database.risk_acceptances.findUnique({
          where: { id: acceptanceId },
          select: { risk_id: true },
        });
        if (!target) return { kind: 'not_found' as const };
        await database.$queryRaw`SELECT id FROM risks WHERE id = ${target.risk_id}::uuid FOR UPDATE`;
        await database.$queryRaw`SELECT control.id FROM security_controls AS control
          JOIN control_risk_links AS link ON link.control_id = control.id
          WHERE link.risk_id = ${target.risk_id}::uuid ORDER BY control.id FOR SHARE OF control`;
        const currentActor = await database.users.findUnique({ where: { id: actorId }, select: { role: true, status: true } });
        if (!currentActor || currentActor.status !== 'ACTIVE' || !['SECURITY_OFFICER', 'EXECUTIVE'].includes(currentActor.role))
          return { kind: 'forbidden' as const };
        const acceptance = await database.risk_acceptances.findUnique({
          where: { id: acceptanceId },
          include: {
            risks: {
              select: {
                id: true,
                risk_code: true,
                status: true,
                control_risk_links: residualControlLinks,
                owner_user_id: true,
                risk_threats: { select: { created_at: true, updated_at: true } },
                risk_vulnerabilities: {
                  select: { created_at: true, updated_at: true },
                },
              },
            },
          },
        });
        if (!acceptance) return { kind: 'not_found' as const };
        if (acceptance.decision !== 'PENDING') return { kind: 'already_decided' as const };
        if (acceptance.requested_by === actorId) return { kind: 'self_approval' as const };
        const decidedAt = await contextWriteTime(database);
        if (
          input.decision === 'approved' && acceptance.valid_until &&
          acceptance.valid_until.toISOString().slice(0, 10) < decidedAt.toISOString().slice(0, 10)
        ) return { kind: 'expired' as const };
        if (
          input.decision === 'approved' &&
          (!['OPEN', 'UNDER_TREATMENT'].includes(acceptance.risks.status) || acceptance.risks.owner_user_id !== acceptance.requested_by ||
            assessmentRequiresReview(
              acceptance.requested_at,
              [...acceptance.risks.risk_vulnerabilities, ...acceptance.risks.risk_threats],
            ))
        )
          return { kind: 'context_changed' as const };
        let completedAcceptPlanId: string | null = null;
        if (input.decision === 'approved') {
          const controlsBlocked = validateResidualControls(acceptance.risks.control_risk_links, decidedAt);
          if (controlsBlocked === 'control_assessments_required') return { kind: 'control_assessments_required' as const };
          if (controlsBlocked === 'control_assessments_stale') return { kind: 'control_assessments_stale' as const };
          const submitted = await database.audit_logs.findFirst({ where: {
            action: 'RISK_ACCEPTANCE_SUBMITTED', resource_type: 'RISK', resource_id: acceptance.risk_id,
            after_data: { path: ['acceptanceId'], equals: acceptanceId },
          }, orderBy: { occurred_at: 'desc' }, select: { after_data: true } });
          const basis = submitted?.after_data;
          if (!basis || typeof basis !== 'object' || Array.isArray(basis) ||
              typeof basis.assessmentId !== 'string' || typeof basis.treatmentPlanId !== 'string' ||
              typeof basis.planUpdatedAt !== 'string' ||
              !sameResidualControlBasis(basis.controlBasis, acceptance.risks.control_risk_links))
            return { kind: 'context_changed' as const };
          const [currentAssessment, currentPlan] = await Promise.all([
            database.risk_assessments.findFirst({ where: { risk_id: acceptance.risk_id, assessment_type: { not: 'TARGET_DEFINITION' } }, orderBy: { assessed_at: 'desc' }, select: { id: true } }),
            database.risk_treatment_plans.findFirst({ where: { id: basis.treatmentPlanId, risk_id: acceptance.risk_id, status: { in: ['DRAFT', 'ACTIVE', 'COMPLETED'] } }, select: { id: true, status: true, updated_at: true, strategy: true, acceptance_cost_basis: true } }),
          ]);
          if (currentPlan?.strategy === 'ACCEPT' && !readAcceptanceCost(currentPlan.acceptance_cost_basis)) return { kind: 'context_changed' as const };
          if (currentAssessment?.id !== basis.assessmentId || currentPlan?.updated_at.toISOString() !== basis.planUpdatedAt)
            return { kind: 'context_changed' as const };
          if (currentPlan?.strategy === 'ACCEPT' && currentPlan.status !== 'COMPLETED') {
            await database.risk_treatment_plans.update({
              where: { id: basis.treatmentPlanId },
              data: { status: 'COMPLETED', updated_at: decidedAt },
            });
            completedAcceptPlanId = basis.treatmentPlanId;
            const planAuditId = randomUUID();
            const before = { planId: basis.treatmentPlanId, status: currentPlan.status };
            const after = { planId: basis.treatmentPlanId, status: 'COMPLETED', acceptanceId, reason: 'Accept proposal completed by independent acceptance approval; no remediation actions were performed.' };
            await database.audit_logs.create({ data: { id: planAuditId, actor_type: 'USER', actor_user_id: actorId,
              action: 'RISK_TREATMENT_PLAN_COMPLETED_BY_ACCEPTANCE', resource_type: 'RISK', resource_id: acceptance.risk_id,
              source: 'API', occurred_at: decidedAt, before_data: before, after_data: after,
              record_hash: createHash('sha256').update(JSON.stringify({ planAuditId, actorId, before, after })).digest('hex') } });
          }
        }
        const decision = input.decision.toUpperCase() as 'APPROVED' | 'REJECTED';
        const updated = await database.risk_acceptances.update({
          where: { id: acceptanceId },
          data: { decision, decided_by: actorId, decided_at: decidedAt },
        });
        const auditId = randomUUID();
        const auditData = { acceptanceId, decision, decisionReason: input.reason, completedAcceptPlanId,
          requestReason: acceptance.reason, validUntil: acceptance.valid_until?.toISOString() ?? null };
        await database.audit_logs.create({ data: { id: auditId, actor_type: 'USER', actor_user_id: actorId,
          action: 'RISK_ACCEPTANCE_DECIDED', resource_type: 'RISK', resource_id: acceptance.risk_id, source: 'API', occurred_at: decidedAt,
          before_data: { decision: acceptance.decision, reason: acceptance.reason }, after_data: auditData,
          record_hash: createHash('sha256').update(JSON.stringify({ auditId, actorId, ...auditData })).digest('hex') } });
        if (decision === 'APPROVED')
          await database.risks.update({
            where: { id: acceptance.risk_id },
            data: { status: 'ACCEPTED', updated_at: new Date() },
          });
        return { kind: 'decided' as const, updated, riskCode: acceptance.risks.risk_code };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  },
  findAcceptanceAudits(riskId: string) {
    return prisma.audit_logs.findMany({ where: { resource_type: 'RISK', resource_id: riskId, outcome: 'SUCCESS',
      action: { in: ['RISK_ACCEPTANCE_SUBMITTED', 'RISK_ACCEPTANCE_DECIDED', 'RISK_REVIEW_OPENED', 'RISK_REVIEW_COMPLETED'] } },
      select: { action: true, after_data: true, occurred_at: true }, orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }] });
  },
  findReviewEvents(riskIds: string[]) {
    return prisma.audit_logs.findMany({
      where: { resource_type: 'RISK', resource_id: { in: riskIds }, outcome: 'SUCCESS',
        action: { in: ['RISK_REVIEW_OPENED', 'RISK_REVIEW_COMPLETED', 'RISK_ACCEPTANCE_DECIDED'] } },
      select: { resource_id: true, action: true, occurred_at: true, after_data: true },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    });
  },
  getAcceptanceControlLinks(riskId: string) {
    return prisma.control_risk_links.findMany({ ...residualControlLinks, where: { risk_id: riskId } });
  },
  openAcceptanceReview(riskId: string, actorId: string, input: OpenRiskReviewBody) {
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT id FROM risks WHERE id = ${riskId}::uuid FOR UPDATE`;
      const actor = await database.users.findUnique({ where: { id: actorId }, select: { status: true, full_name: true } });
      const risk = await database.risks.findUnique({ where: { id: riskId }, select: {
        id: true, owner_user_id: true, status: true, updated_at: true, review_date: true,
        risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 },
        risk_treatment_plans: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
      } });
      if (!risk) return { kind: 'not_found' as const };
      if (actor?.status !== 'ACTIVE' || risk.owner_user_id !== actorId) return { kind: 'not_owner' as const };
      if (!['OPEN', 'UNDER_TREATMENT', 'ACCEPTED'].includes(risk.status) || risk.risk_acceptances.length) return { kind: 'context_locked' as const };
      if (risk.updated_at.toISOString() !== input.expectedUpdatedAt) return { kind: 'stale' as const };
      const events = await database.audit_logs.findMany({
        where: { resource_type: 'RISK', resource_id: riskId, outcome: 'SUCCESS',
          action: { in: ['RISK_REVIEW_OPENED', 'RISK_REVIEW_COMPLETED', 'RISK_ACCEPTANCE_DECIDED'] } },
        select: { action: true, occurred_at: true, after_data: true }, orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      });
      if (currentRiskReview(events)) return { kind: 'review_already_open' as const };
      const now = await contextWriteTime(database);
      const status = risk.status === 'ACCEPTED' ? (risk.risk_treatment_plans.length ? 'UNDER_TREATMENT' : 'OPEN') : risk.status;
      const updated = await database.risks.update({ where: { id: riskId }, data: { status, updated_at: now }, select: { id: true, status: true, updated_at: true } });
      const auditId = randomUUID();
      const after = { status, reason: input.reason, openedBy: actorId, openedByName: actor.full_name,
        previousReviewDate: risk.review_date?.toISOString() ?? null };
      await database.audit_logs.create({ data: { id: auditId, actor_type: 'USER', actor_user_id: actorId,
        action: 'RISK_REVIEW_OPENED', resource_type: 'RISK', resource_id: riskId, source: 'API', occurred_at: now,
        before_data: { status: risk.status }, after_data: after,
        record_hash: createHash('sha256').update(JSON.stringify({ auditId, actorId, ...after })).digest('hex') } });
      return { kind: 'opened' as const, updated };
    });
  },
  completeReview(riskId: string, actorId: string, input: CompleteRiskReview) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM risks WHERE id = ${riskId}::uuid FOR UPDATE`;
      const actor = await tx.users.findUnique({ where: { id: actorId }, select: { status: true, full_name: true } });
      if (actor?.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      const risk = await tx.risks.findUnique({ where: { id: riskId }, select: {
        id: true, status: true, owner_user_id: true, updated_at: true, review_date: true,
        risk_acceptances: { where: { decision: 'PENDING' }, select: { id: true }, take: 1 },
        risk_assessments: { where: { assessment_type: { not: 'TARGET_DEFINITION' } }, orderBy: { assessed_at: 'desc' }, take: 1 },
        risk_threats: { select: { created_at: true, updated_at: true } },
        risk_vulnerabilities: { select: { created_at: true, updated_at: true } },
        risk_assets: { select: { assets: { select: { id: true, classified_at: true } } } },
        control_risk_links: residualControlLinks,
      } });
      if (!risk) throw new AppError(404, 'RISK_NOT_FOUND', 'Risk not found');
      if (risk.owner_user_id !== actorId) throw new AppError(403, 'RISK_OWNER_REQUIRED', 'Only the assigned Risk Owner may complete review');
      if (!['OPEN', 'UNDER_TREATMENT'].includes(risk.status) || risk.risk_acceptances.length)
        throw new AppError(409, 'RISK_CONTEXT_LOCKED', 'Resolve pending acceptance and review an open or under-treatment Risk');
      const events = await tx.audit_logs.findMany({ where: { resource_type: 'RISK', resource_id: riskId, outcome: 'SUCCESS',
        action: { in: ['RISK_REVIEW_OPENED', 'RISK_REVIEW_COMPLETED', 'RISK_ACCEPTANCE_DECIDED'] } },
        select: { action: true, after_data: true, occurred_at: true }, orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }] });
      const review = currentRiskReview(events);
      if (!review || review.openedAt.toISOString() !== input.expectedOpenedAt || risk.updated_at.toISOString() !== input.expectedUpdatedAt)
        throw new AppError(409, 'RISK_REVIEW_CHANGED', 'Review changed or already completed. Refresh the Risk.');
      const assessment = risk.risk_assessments[0];
      if (!assessment?.residual_rating || assessment.id !== input.assessmentId || assessment.assessed_at <= review.openedAt ||
          assessmentRequiresReview(assessment.assessed_at, [...risk.risk_threats, ...risk.risk_vulnerabilities]))
        throw new AppError(409, 'RISK_REASSESSMENT_REQUIRED', 'Save a current residual assessment after opening review');
      const inherent = await tx.risk_assessments.findFirst({ where: { risk_id: riskId, inherent_rating: { not: null }, residual_rating: null, assessment_type: { not: 'TARGET_DEFINITION' } }, orderBy: { assessed_at: 'desc' } });
      if (!inherent || inherent.assessed_at > assessment.assessed_at ||
          assessmentRequiresReview(inherent.assessed_at, [...risk.risk_threats, ...risk.risk_vulnerabilities]) ||
          risk.risk_assets.some(({ assets }) => assets.classified_at && assets.classified_at > inherent.assessed_at) ||
          await tx.audit_logs.findFirst({ where: { resource_type: 'ASSET', resource_id: { in: risk.risk_assets.map(({ assets }) => assets.id) },
            action: 'ASSET_CONTEXT_UPDATED', outcome: 'SUCCESS', occurred_at: { gt: inherent.assessed_at } }, select: { id: true } }))
        throw new AppError(409, 'RISK_REASSESSMENT_REQUIRED', 'Review changed Asset/context and reassess inherent then residual risk');
      if (validateResidualControls(risk.control_risk_links) || risk.control_risk_links.some(({ security_controls }) =>
        security_controls.control_assessments[0] && security_controls.control_assessments[0].assessed_at > assessment.assessed_at))
        throw new AppError(409, 'CONTROL_REASSESSMENT_REQUIRED', 'Review current Controls/Evidence and save a new residual assessment before completing');
      const now = await contextWriteTime(tx);
      const today = vietnamDate(now);
      const maximum = reviewDeadline(today, assessment.residual_rating);
      if (input.nextReviewDate <= today || input.nextReviewDate > maximum)
        throw new AppError(422, 'INVALID_REVIEW_DATE', `Next review date must be after ${today} and no later than ${maximum} (Vietnam time)`);
      const after = { openedAt: review.openedAt.toISOString(), openedBy: review.openedBy, openedByName: review.openedByName,
        openingReason: review.reason, previousReviewDate: review.previousReviewDate,
        completedBy: actorId, completedByName: actor.full_name, conclusion: input.conclusion,
        assessmentId: assessment.id, residualRating: assessment.residual_rating.toLowerCase(),
        nextReviewDate: input.nextReviewDate, recommendedReviewDate: maximum, methodologyVersion: 'SECURAAI-REVIEW-CYCLE-v1' };
      await tx.risks.update({ where: { id: riskId }, data: { review_date: new Date(`${input.nextReviewDate}T00:00:00Z`), updated_at: now } });
      const id = randomUUID();
      await tx.audit_logs.create({ data: { id, actor_type: 'USER', actor_user_id: actorId, action: 'RISK_REVIEW_COMPLETED',
        resource_type: 'RISK', resource_id: riskId, source: 'API', occurred_at: now,
        before_data: { reviewDate: risk.review_date?.toISOString() ?? null }, after_data: after,
        record_hash: createHash('sha256').update(JSON.stringify({ id, actorId, riskId, after })).digest('hex') } });
      return { riskId, completedAt: now, nextReviewDate: input.nextReviewDate };
    }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
  },
};
