import type { reassessment_status } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListOwnedReassessmentRequestsQuery } from './dto/review-risk-reassessment-request.dto.js';
import type { CompleteRiskReassessmentInput } from './dto/review-risk-reassessment-request.dto.js';

const requestSelect = {
  id: true,
  reason: true,
  status: true,
  requested_at: true,
  reviewed_at: true,
  risks: {
    select: {
      id: true, risk_code: true, title: true, status: true, owner_user_id: true,
      risk_assessments: { orderBy: { assessed_at: 'desc' as const }, take: 1, select: { inherent_likelihood: true, inherent_impact: true, inherent_rating: true } },
      risk_treatment_plans: { where: { status: { not: 'CANCELLED' as const } }, orderBy: { updated_at: 'desc' as const }, select: { id: true, title: true, strategy: true, status: true, target_completion_date: true } },
    },
  },
  incidents: { select: { id: true, incident_code: true, title: true, severity: true } },
  control_findings: {
    select: {
      id: true,
      severity: true,
      description: true,
      status: true,
      security_controls: { select: { id: true, control_code: true, name: true } },
    },
  },
  users_risk_reassessment_requests_requested_byTousers: {
    select: { id: true, full_name: true },
  },
} as const;

export const riskReassessmentReviewRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true } });
  },
  async listOwned(userId: string | undefined, query: ListOwnedReassessmentRequestsQuery) {
    const where = {
      ...(userId ? { risks: { owner_user_id: userId } } : {}),
      status: query.status
        ? (query.status.toUpperCase() as reassessment_status)
        : { in: ['PENDING', 'UNDER_REVIEW'] as reassessment_status[] },
    };
    return Promise.all([
      prisma.risk_reassessment_requests.count({ where }),
      prisma.risk_reassessment_requests.findMany({
        where,
        select: requestSelect,
        orderBy: [{ requested_at: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },
  findById(requestId: string) {
    return prisma.risk_reassessment_requests.findUnique({
      where: { id: requestId },
      select: requestSelect,
    });
  },
  async startReview(requestId: string, userId: string) {
    const result = await prisma.risk_reassessment_requests.updateMany({
      where: { id: requestId, status: 'PENDING', risks: { owner_user_id: userId } },
      data: { status: 'UNDER_REVIEW', reviewed_by: userId },
    });
    if (result.count === 0) return null;
    return this.findById(requestId);
  },
  async complete(requestId: string, actorId: string, input: CompleteRiskReassessmentInput) {
    return prisma.$transaction(async (database) => {
      const request = await database.risk_reassessment_requests.findUnique({ where: { id: requestId }, select: { id: true, status: true, risk_id: true, risks: { select: { risk_assessments: { orderBy: { assessed_at: 'desc' }, take: 1, select: { inherent_likelihood: true, inherent_impact: true, inherent_rating: true } } } } } });
      if (!request) return { kind: 'not_found' as const };
      if (request.status !== 'UNDER_REVIEW') return { kind: 'invalid_status' as const };
      const plan = await database.risk_treatment_plans.findFirst({ where: { id: input.treatmentPlanId, risk_id: request.risk_id, status: { not: 'CANCELLED' } }, select: { id: true } });
      if (!plan) return { kind: 'invalid_plan' as const };
      const latest = request.risks.risk_assessments[0];
      if (!latest?.inherent_likelihood || !latest.inherent_impact || !latest.inherent_rating) return { kind: 'missing_inherent' as const };
      const score = input.residualLikelihood * input.residualImpact;
      const residualRating = score >= 20 ? 'CRITICAL' : score >= 12 ? 'HIGH' : score >= 6 ? 'MEDIUM' : 'LOW';
      const completedAt = new Date();
      const assessment = await database.risk_assessments.create({ data: { risk_id: request.risk_id, assessment_type: 'INCIDENT_REASSESSMENT', inherent_likelihood: latest.inherent_likelihood, inherent_impact: latest.inherent_impact, inherent_rating: latest.inherent_rating, control_effectiveness: input.controlEffectiveness, residual_likelihood: input.residualLikelihood, residual_impact: input.residualImpact, residual_rating: residualRating, assessment_reason: input.assessmentReason, assessed_by: actorId, reassessment_request_id: request.id }, select: { id: true, residual_rating: true } });
      const treatmentPlan = await database.risk_treatment_plans.update({ where: { id: plan.id }, data: { status: input.treatmentPlanStatus.toUpperCase() as 'DRAFT' | 'ACTIVE' | 'COMPLETED', target_completion_date: new Date(`${input.targetDate}T00:00:00.000Z`) }, select: { id: true, title: true, status: true, target_completion_date: true } });
      await database.risk_reassessment_requests.update({ where: { id: request.id }, data: { status: 'COMPLETED', reviewed_by: actorId, reviewed_at: completedAt } });
      return { kind: 'completed' as const, assessment, treatmentPlan, score, completedAt };
    });
  },
};
