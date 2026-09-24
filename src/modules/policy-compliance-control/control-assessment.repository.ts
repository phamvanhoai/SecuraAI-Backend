import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { CreateControlAssessmentInput, ListControlAssessmentsQuery } from './dto/control-assessment.dto.js';

const assessmentSelect = {
  control_assessment_id: true,
  compliance_status: true,
  score: true,
  notes: true,
  assessed_at: true,
  next_review_at: true,
  users: { select: { user_id: true, full_name: true, email: true } },
  _count: { select: { compliance_evidence: true } },
} satisfies Prisma.control_assessmentsSelect;

export const controlAssessmentRepository = {
  async list(query: ListControlAssessmentsQuery) {
    const where: Prisma.compliance_controlsWhereInput = {
      ...(query.frameworkId ? { compliance_framework_id: query.frameworkId } : {}),
      ...(query.q ? { OR: [
        { control_code: { contains: query.q, mode: 'insensitive' } },
        { title: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
    };
    const needsAssessmentFilter = query.status !== undefined || query.reviewState !== undefined;
    const candidateLimit = 5000;
    const candidates = await prisma.compliance_controls.findMany({
      where, take: candidateLimit,
      orderBy: [{ compliance_frameworks: { code: 'asc' } }, { control_code: 'asc' }],
      select: { compliance_control_id: true, control_assessments: { orderBy: { assessed_at: 'desc' }, take: 1, select: { compliance_status: true, next_review_at: true } } },
    });
    const now = new Date(); const soon = new Date(now.getTime() + 30 * 86_400_000);
    const filteredIds = candidates.filter((item) => {
      const latest = item.control_assessments[0];
      if (query.status && (latest?.compliance_status ?? 'not_assessed') !== query.status) return false;
      if (!query.reviewState) return true;
      const next = latest?.next_review_at;
      if (query.reviewState === 'unscheduled') return next == null;
      if (!next) return false;
      if (query.reviewState === 'overdue') return next < now;
      if (query.reviewState === 'due_soon') return next >= now && next <= soon;
      return next > soon;
    }).map((item) => item.compliance_control_id);
    const summary = candidates.reduce((totals, item) => {
      const latest = item.control_assessments[0];
      const status = latest?.compliance_status ?? 'not_assessed';
      if (status === 'compliant') totals.compliant += 1;
      else if (status === 'partially_compliant') totals.partiallyCompliant += 1;
      else if (status === 'non_compliant') totals.nonCompliant += 1;
      else totals.notAssessed += 1;
      if (latest?.next_review_at && latest.next_review_at < now) totals.overdue += 1;
      return totals;
    }, { compliant: 0, partiallyCompliant: 0, nonCompliant: 0, notAssessed: 0, overdue: 0 });
    const pagedIds = needsAssessmentFilter ? filteredIds.slice((query.page - 1) * query.limit, query.page * query.limit) : undefined;
    const itemWhere = pagedIds ? { compliance_control_id: { in: pagedIds } } : where;
    const [items, unfilteredTotal, frameworks] = await prisma.$transaction([
      prisma.compliance_controls.findMany({
        where: itemWhere,
        ...(pagedIds ? {} : { skip: (query.page - 1) * query.limit, take: query.limit }),
        orderBy: [{ compliance_frameworks: { code: 'asc' } }, { control_code: 'asc' }],
        select: {
          compliance_control_id: true,
          control_code: true,
          title: true,
          description: true,
          compliance_frameworks: { select: { compliance_framework_id: true, code: true, name: true, version: true } },
          control_assessments: { orderBy: { assessed_at: 'desc' }, take: 1, select: assessmentSelect },
          policy_control_mappings: { take: 5, select: { policy_versions: { select: { policy_version_id: true, version_number: true, status: true, policies: { select: { policy_id: true, policy_code: true, title: true } } } } } },
          _count: { select: { policy_control_mappings: true } },
        },
      }),
      prisma.compliance_controls.count({ where }),
      prisma.compliance_frameworks.findMany({
        where: { compliance_controls: { some: {} } },
        orderBy: [{ code: 'asc' }, { version: 'asc' }],
        select: { compliance_framework_id: true, code: true, name: true, version: true },
      }),
    ]);
    return { items, total: needsAssessmentFilter ? filteredIds.length : unfilteredTotal, frameworks, summary, truncated: unfilteredTotal > candidateLimit };
  },

  findControl(controlId: string) {
    return prisma.compliance_controls.findUnique({
      where: { compliance_control_id: controlId },
      select: { compliance_control_id: true, control_code: true, title: true },
    });
  },

  listHistory(controlId: string) {
    return prisma.control_assessments.findMany({
      where: { compliance_control_id: controlId },
      orderBy: { assessed_at: 'desc' },
      take: 20,
      select: assessmentSelect,
    });
  },

  async create(controlId: string, input: CreateControlAssessmentInput, actorUserId: string, context: { ipAddress: string | null; userAgent: string | null }) {
    return prisma.$transaction(async (database) => {
      const created = await database.control_assessments.create({
        data: {
          compliance_control_id: controlId,
          assessed_by_user_id: actorUserId,
          compliance_status: input.complianceStatus,
          score: input.score ?? null,
          notes: input.notes || null,
          next_review_at: input.nextReviewAt ? new Date(input.nextReviewAt) : null,
        },
        select: assessmentSelect,
      });
      await database.audit_logs.create({ data: {
        actor_user_id: actorUserId,
        module: 'policy-compliance',
        action: 'control.compliance.assessed',
        entity_type: 'compliance_control',
        entity_id: controlId,
        after_data: { assessmentId: created.control_assessment_id, status: input.complianceStatus, score: input.score ?? null },
        ip_address: context.ipAddress,
        user_agent: context.userAgent,
      } });
      return created;
    });
  },
};
