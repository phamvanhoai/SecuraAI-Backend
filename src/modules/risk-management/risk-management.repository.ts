import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListRiskAssessmentsQuery } from './dto/list-risk-assessments-query.dto.js';
import type { CreateRiskAssessmentBody } from './dto/create-risk-assessment.dto.js';
import type { UpdateRiskAssessmentBody } from './dto/update-risk-assessment.dto.js';
import type { CancelRiskAssessmentBody } from './dto/cancel-risk-assessment.dto.js';
import type { RiskCreateOptionsQuery } from './dto/risk-create-options-query.dto.js';
import type { SubmitTreatmentPlanBody } from './dto/submit-treatment-plan.dto.js';
import type { ApproveTreatmentPlanBody } from './dto/approve-treatment-plan.dto.js';
import type { ReturnTreatmentPlanForRevisionBody } from './dto/return-treatment-plan-for-revision.dto.js';
import type { ListTreatmentPlansQuery } from './dto/list-treatment-plans-query.dto.js';

const treatmentPlanListSelect = {
  risk_treatment_plan_id: true,
  strategy: true,
  status: true,
  target_date: true,
  created_at: true,
  updated_at: true,
  users_risk_treatment_plans_owner_user_idTousers: {
    select: { user_id: true, full_name: true, status: true, deleted_at: true },
  },
  risk_assessments: {
    select: {
      risk_assessment_id: true,
      risk_code: true,
      title: true,
      risk_level: true,
      status: true,
    },
  },
} satisfies Prisma.risk_treatment_plansSelect;

type TreatmentPlanBaseRecord = Prisma.risk_treatment_plansGetPayload<{
  select: typeof treatmentPlanListSelect;
}>;

export type TreatmentPlanListRecord = TreatmentPlanBaseRecord & {
  actionProgress: number | null;
  completedActions: number;
  totalActions: number;
};

const treatmentPlanDetailSelect = {
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
  users_risk_treatment_plans_created_by_user_idTousers: {
    select: { user_id: true, full_name: true, status: true, deleted_at: true },
  },
  risk_assessments: {
    select: {
      risk_assessment_id: true,
      risk_code: true,
      title: true,
      description: true,
      risk_score: true,
      risk_level: true,
      status: true,
      assets: { select: { asset_id: true, asset_code: true, name: true, deleted_at: true } },
      business_processes: {
        select: { business_process_id: true, code: true, name: true },
      },
    },
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
      created_at: true,
      updated_at: true,
      users: { select: { user_id: true, full_name: true, status: true, deleted_at: true } },
    },
    orderBy: [{ due_date: 'asc' as const }, { risk_treatment_action_id: 'asc' as const }],
  },
} satisfies Prisma.risk_treatment_plansSelect;

type TreatmentPlanDetailBase = Prisma.risk_treatment_plansGetPayload<{
  select: typeof treatmentPlanDetailSelect;
}>;

export type TreatmentPlanDetailRecord = TreatmentPlanDetailBase & {
  approval: TreatmentPlanApprovalRecord | null;
};

const treatmentPlanOrderBy = (
  field: ListTreatmentPlansQuery['sortBy'],
  order: ListTreatmentPlansQuery['sortOrder'],
): Prisma.risk_treatment_plansOrderByWithRelationInput[] => {
  if (field === 'riskCode')
    return [{ risk_assessments: { risk_code: order } }, { risk_treatment_plan_id: 'asc' }];
  const column = {
    strategy: 'strategy',
    status: 'status',
    targetDate: 'target_date',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }[field];
  return [{ [column]: order }, { risk_treatment_plan_id: 'asc' }];
};

const treatmentPlanWhere = (
  query: ListTreatmentPlansQuery,
): Prisma.risk_treatment_plansWhereInput => {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const conditions: Prisma.risk_treatment_plansWhereInput[] = [];
  if (query.status) conditions.push({ status: query.status });
  if (query.strategy) conditions.push({ strategy: query.strategy });
  if (query.ownerId) conditions.push({ owner_user_id: query.ownerId });
  if (query.targetFrom || query.targetTo)
    conditions.push({
      target_date: {
        ...(query.targetFrom && { gte: new Date(`${query.targetFrom}T00:00:00.000Z`) }),
        ...(query.targetTo && { lte: new Date(`${query.targetTo}T23:59:59.999Z`) }),
      },
    });
  if (query.overdue === true)
    conditions.push({
      target_date: { lt: today },
      status: { notIn: ['completed', 'cancelled'] },
    });
  if (query.overdue === false)
    conditions.push({
      OR: [
        { target_date: null },
        { target_date: { gte: today } },
        { status: { in: ['completed', 'cancelled'] } },
      ],
    });
  if (query.q)
    conditions.push({
      OR: [
        { risk_assessments: { is: { risk_code: { contains: query.q, mode: 'insensitive' } } } },
        { risk_assessments: { is: { title: { contains: query.q, mode: 'insensitive' } } } },
        {
          users_risk_treatment_plans_owner_user_idTousers: {
            is: { full_name: { contains: query.q, mode: 'insensitive' } },
          },
        },
      ],
    });
  return conditions.length ? { AND: conditions } : {};
};

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
      users_risk_treatment_plans_created_by_user_idTousers: {
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

const treatmentPlanApprovalSelect = {
  approval_request_id: true,
  entity_id: true,
  current_step: true,
  status: true,
  submitted_at: true,
  completed_at: true,
  submission_note: true,
  approval_actions: {
    orderBy: { acted_at: 'desc' as const },
    select: {
      decision: true,
      comment: true,
      acted_at: true,
      users: { select: { user_id: true, full_name: true, status: true, deleted_at: true } },
    },
  },
  users: { select: { user_id: true, full_name: true, status: true, deleted_at: true } },
  workflow_definitions: {
    select: {
      workflow_steps: {
        orderBy: { step_order: 'asc' as const },
        take: 20,
        select: {
          step_order: true,
          name: true,
          roles: { select: { code: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.approval_requestsSelect;

type TreatmentPlanApprovalRecord = Prisma.approval_requestsGetPayload<{
  select: typeof treatmentPlanApprovalSelect;
}>;

export type RiskAssessmentDetailWithApprovals = RiskAssessmentDetailRecord & {
  treatmentPlanApprovals: TreatmentPlanApprovalRecord[];
};

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

const canonicalJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJson(item)]),
  );
};

export class RiskApprovalTransactionError extends Error {
  constructor(readonly reason: 'NO_ELIGIBLE_APPROVER') {
    super(reason);
    this.name = 'RiskApprovalTransactionError';
  }
}

export const riskManagementRepository = {
  async findTreatmentPlanDetail(id: string): Promise<TreatmentPlanDetailRecord | null> {
    return prisma.$transaction(async (transaction) => {
      const plan = await transaction.risk_treatment_plans.findUnique({
        where: { risk_treatment_plan_id: id },
        select: treatmentPlanDetailSelect,
      });
      if (!plan) return null;
      const approval = await transaction.approval_requests.findFirst({
        where: { entity_type: 'risk_treatment_plan', entity_id: id },
        select: treatmentPlanApprovalSelect,
        orderBy: [{ submitted_at: 'desc' }, { approval_request_id: 'desc' }],
      });
      return { ...plan, approval };
    });
  },
  async listTreatmentPlans(
    query: ListTreatmentPlansQuery,
  ): Promise<{ items: TreatmentPlanListRecord[]; total: number }> {
    return prisma.$transaction(async (transaction) => {
      const where = treatmentPlanWhere(query);
      const [total, plans] = await Promise.all([
        transaction.risk_treatment_plans.count({ where }),
        transaction.risk_treatment_plans.findMany({
          where,
          select: treatmentPlanListSelect,
          orderBy: treatmentPlanOrderBy(query.sortBy, query.sortOrder),
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ]);
      const planIds = plans.map(({ risk_treatment_plan_id }) => risk_treatment_plan_id);
      const [progress, completed] = planIds.length
        ? await Promise.all([
            transaction.risk_treatment_actions.groupBy({
              by: ['risk_treatment_plan_id'],
              where: {
                risk_treatment_plan_id: { in: planIds },
                status: { not: 'cancelled' },
              },
              _avg: { progress_percent: true },
              _count: { _all: true },
            }),
            transaction.risk_treatment_actions.groupBy({
              by: ['risk_treatment_plan_id'],
              where: { risk_treatment_plan_id: { in: planIds }, status: 'completed' },
              _count: { _all: true },
            }),
          ])
        : [[], []];
      const progressByPlan = new Map(
        progress.map((item) => [
          item.risk_treatment_plan_id,
          { average: item._avg.progress_percent, total: item._count._all },
        ]),
      );
      const completedByPlan = new Map(
        completed.map((item) => [item.risk_treatment_plan_id, item._count._all]),
      );
      return {
        total,
        items: plans.map((plan) => ({
          ...plan,
          actionProgress: progressByPlan.get(plan.risk_treatment_plan_id)?.average ?? null,
          totalActions: progressByPlan.get(plan.risk_treatment_plan_id)?.total ?? 0,
          completedActions: completedByPlan.get(plan.risk_treatment_plan_id) ?? 0,
        })),
      };
    });
  },
  findTreatmentPlanForSubmission(id: string) {
    return prisma.risk_treatment_plans.findUnique({
      where: { risk_treatment_plan_id: id },
      select: {
        risk_treatment_plan_id: true,
        created_by_user_id: true,
        owner_user_id: true,
        status: true,
        updated_at: true,
      },
    });
  },
  submitTreatmentPlan(
    id: string,
    input: SubmitTreatmentPlanBody,
    context: {
      actorUserId: string;
      actorIsAdmin: boolean;
      ipAddress: string | null;
      userAgent: string | null;
    },
  ) {
    return prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`risk-treatment-plan:mutation:${id}`}, 0)
          )
        `;
        const [actor, plan] = await Promise.all([
          transaction.users.findFirst({
            where: { user_id: context.actorUserId, deleted_at: null, status: 'active' },
            select: { user_id: true, full_name: true },
          }),
          transaction.risk_treatment_plans.findUnique({
            where: { risk_treatment_plan_id: id },
            select: {
              risk_treatment_plan_id: true,
              risk_assessment_id: true,
              strategy: true,
              description: true,
              owner_user_id: true,
              created_by_user_id: true,
              target_date: true,
              status: true,
              submitted_at: true,
              updated_at: true,
              risk_assessments: {
                select: {
                  risk_assessment_id: true,
                  risk_code: true,
                  title: true,
                  status: true,
                  likelihood: true,
                  impact: true,
                  risk_score: true,
                  risk_level: true,
                  updated_at: true,
                  assets: { select: { asset_id: true, asset_code: true, name: true, status: true, deleted_at: true } },
                  business_processes: { select: { business_process_id: true, code: true, name: true, status: true } },
                  risk_assessment_threats: {
                    orderBy: { threat_id: 'asc' },
                    select: { threat_id: true, notes: true },
                  },
                  risk_assessment_vulnerabilities: {
                    orderBy: { vulnerability_id: 'asc' },
                    select: { vulnerability_id: true, notes: true },
                  },
                },
              },
              users_risk_treatment_plans_owner_user_idTousers: {
                select: { user_id: true, full_name: true, status: true, deleted_at: true },
              },
              risk_treatment_actions: {
                select: {
                  risk_treatment_action_id: true,
                  title: true,
                  assigned_to_user_id: true,
                  due_date: true,
                  progress_percent: true,
                  status: true,
                  users: { select: { status: true, deleted_at: true } },
                },
                orderBy: { risk_treatment_action_id: 'asc' },
                take: 100,
              },
              _count: { select: { risk_treatment_actions: true } },
            },
          }),
        ]);
        if (!actor) return { failure: 'ACTOR_INACTIVE' as const, result: null };
        if (!plan) return { failure: 'PLAN_NOT_FOUND' as const, result: null };
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`risk-assessment:mutation:${plan.risk_assessment_id}`}, 0)
          )
        `;
        if (
          !context.actorIsAdmin &&
          plan.created_by_user_id !== context.actorUserId &&
          plan.owner_user_id !== context.actorUserId
        )
          return { failure: 'NOT_PLAN_OWNER' as const, result: null };
        if (!['draft', 'rejected'].includes(plan.status))
          return { failure: 'PLAN_NOT_SUBMITTABLE' as const, result: null };
        if (!['draft', 'rejected'].includes(plan.risk_assessments.status))
          return { failure: 'RISK_NOT_SUBMITTABLE' as const, result: null };
        if (plan.risk_assessments.updated_at.getTime() !== new Date(input.expectedRiskUpdatedAt).getTime())
          return { failure: 'RISK_CHANGED' as const, result: null };
        if (
          !plan.risk_assessments.risk_assessment_threats.length ||
          !plan.risk_assessments.risk_assessment_vulnerabilities.length ||
          (!plan.risk_assessments.assets && !plan.risk_assessments.business_processes) ||
          (plan.risk_assessments.assets && (plan.risk_assessments.assets.deleted_at !== null || plan.risk_assessments.assets.status === 'disposed')) ||
          (plan.risk_assessments.business_processes && plan.risk_assessments.business_processes.status !== 'active')
        )
          return { failure: 'RISK_INVALID' as const, result: null };
        if (plan.description.normalize('NFKC').replace(/\s+/gu, ' ').trim().length < 10)
          return { failure: 'DESCRIPTION_REQUIRED' as const, result: null };
        const owner = plan.users_risk_treatment_plans_owner_user_idTousers;
        if (!owner || owner.deleted_at || owner.status !== 'active')
          return { failure: 'OWNER_INACTIVE' as const, result: null };
        if (!plan.target_date) return { failure: 'TARGET_DATE_REQUIRED' as const, result: null };
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (plan.target_date < today)
          return { failure: 'TARGET_DATE_IN_PAST' as const, result: null };
        if (plan._count.risk_treatment_actions > 100)
          return { failure: 'TOO_MANY_ACTIONS' as const, result: null };
        const activeActions = plan.risk_treatment_actions.filter(
          ({ status }) => status !== 'cancelled',
        );
        if (plan.strategy !== 'accept' && activeActions.length === 0)
          return { failure: 'ACTIONS_REQUIRED' as const, result: null };
        for (const action of activeActions) {
          if (
            !action.assigned_to_user_id ||
            !action.users ||
            action.users.deleted_at ||
            action.users.status !== 'active'
          )
            return { failure: 'ACTION_ASSIGNEE_INVALID' as const, result: null };
          if (!action.due_date)
            return { failure: 'ACTION_DUE_DATE_REQUIRED' as const, result: null };
          if (action.due_date < today || action.due_date > plan.target_date)
            return { failure: 'ACTION_DUE_DATE_INVALID' as const, result: null };
          if (action.status !== 'pending' || action.progress_percent !== 0)
            return { failure: 'ACTION_ALREADY_STARTED' as const, result: null };
        }
        const otherActivePlan = await transaction.risk_treatment_plans.findFirst({
          where: {
            risk_treatment_plan_id: { not: id },
            risk_assessment_id: plan.risk_assessment_id,
            status: { in: ['pending_approval', 'approved', 'in_progress'] },
          },
          select: { risk_treatment_plan_id: true },
        });
        if (otherActivePlan) return { failure: 'OTHER_ACTIVE_PLAN' as const, result: null };
        const existingRequest = await transaction.approval_requests.findFirst({
          where: { entity_type: 'risk_treatment_plan', entity_id: id, status: 'pending' },
          select: { approval_request_id: true },
        });
        if (existingRequest) return { failure: 'ALREADY_SUBMITTED' as const, result: null };
        const workflows = await transaction.workflow_definitions.findMany({
          where: { entity_type: 'risk_treatment_plan', is_active: true },
          select: {
            workflow_definition_id: true,
            _count: { select: { workflow_steps: true } },
            workflow_steps: {
              orderBy: { step_order: 'asc' },
              take: 21,
              select: {
                workflow_step_id: true,
                step_order: true,
                approver_role_id: true,
                required_approvals: true,
              },
            },
          },
          orderBy: { created_at: 'asc' },
          take: 2,
        });
        if (workflows.length === 0)
          return { failure: 'WORKFLOW_NOT_CONFIGURED' as const, result: null };
        if (workflows.length !== 1)
          return { failure: 'MULTIPLE_ACTIVE_WORKFLOWS' as const, result: null };
        const workflow = workflows[0];
        const firstStep = workflow?.workflow_steps[0];
        if (!workflow || !firstStep?.approver_role_id)
          return { failure: 'WORKFLOW_NOT_CONFIGURED' as const, result: null };
        if (
          workflow._count.workflow_steps > 20 ||
          workflow.workflow_steps.some(
            (step, index) =>
              step.step_order !== index + 1 ||
              !step.approver_role_id ||
              step.required_approvals < 1 ||
              step.required_approvals > 100,
          )
        )
          return { failure: 'WORKFLOW_INVALID' as const, result: null };
        const now = new Date();
        const approversByStep = await Promise.all(
          workflow.workflow_steps.map(async (step) => {
            const roleId = step.approver_role_id ?? '';
            const [directApprovers, delegations] = await Promise.all([
              transaction.users.findMany({
                where: {
                  user_id: { not: context.actorUserId },
                  deleted_at: null,
                  status: 'active',
                  user_roles_user_roles_user_idTousers: { some: { role_id: roleId } },
                },
                select: { user_id: true },
                take: 100,
              }),
              transaction.approval_delegations.findMany({
                where: {
                  is_active: true,
                  start_at: { lte: now },
                  end_at: { gte: now },
                  delegator_user_id: { not: context.actorUserId },
                  delegate_user_id: { not: context.actorUserId },
                  users_approval_delegations_delegator_user_idTousers: {
                    deleted_at: null,
                    status: 'active',
                    user_roles_user_roles_user_idTousers: { some: { role_id: roleId } },
                  },
                  users_approval_delegations_delegate_user_idTousers: {
                    deleted_at: null,
                    status: 'active',
                  },
                },
                select: { delegate_user_id: true },
                take: 100,
              }),
            ]);
            return [
              ...new Set([
                ...directApprovers.map(({ user_id }) => user_id),
                ...delegations.map(({ delegate_user_id }) => delegate_user_id),
              ]),
            ];
          }),
        );
        if (
          workflow.workflow_steps.some(
            (step, index) => (approversByStep[index]?.length ?? 0) < step.required_approvals,
          )
        )
          return { failure: 'NO_ELIGIBLE_APPROVER' as const, result: null };
        const approvers = approversByStep[0] ?? [];
        const submittedAt = new Date();
        const changed = await transaction.risk_treatment_plans.updateMany({
          where: {
            risk_treatment_plan_id: id,
            status: { in: ['draft', 'rejected'] },
            updated_at: new Date(input.expectedUpdatedAt),
          },
          data: { status: 'pending_approval', submitted_at: submittedAt, updated_at: submittedAt },
        });
        if (changed.count !== 1) return { failure: 'PLAN_CHANGED' as const, result: null };
        const riskChanged = await transaction.risk_assessments.updateMany({
          where: {
            risk_assessment_id: plan.risk_assessment_id,
            status: { in: ['draft', 'rejected'] },
            updated_at: new Date(input.expectedRiskUpdatedAt),
          },
          data: { status: 'pending_approval', updated_at: submittedAt },
        });
        if (riskChanged.count !== 1) return { failure: 'RISK_CHANGED' as const, result: null };
        const request = await transaction.approval_requests.create({
          data: {
            workflow_definition_id: workflow.workflow_definition_id,
            entity_type: 'risk_treatment_plan',
            entity_id: id,
            requested_by_user_id: context.actorUserId,
            current_step: firstStep.step_order,
            status: 'pending',
            submitted_at: submittedAt,
            submission_note: input.submissionNote ?? null,
            entity_snapshot: {
              riskAssessment: {
                id: plan.risk_assessments.risk_assessment_id,
                code: plan.risk_assessments.risk_code,
                title: plan.risk_assessments.title,
                status: 'pending_approval',
                likelihood: plan.risk_assessments.likelihood,
                impact: plan.risk_assessments.impact,
                score: plan.risk_assessments.risk_score,
                level: plan.risk_assessments.risk_level,
                target: plan.risk_assessments.assets
                  ? { type: 'asset', id: plan.risk_assessments.assets.asset_id, code: plan.risk_assessments.assets.asset_code, name: plan.risk_assessments.assets.name }
                  : { type: 'businessProcess', id: plan.risk_assessments.business_processes?.business_process_id ?? '', code: plan.risk_assessments.business_processes?.code ?? '', name: plan.risk_assessments.business_processes?.name ?? '' },
                threats: plan.risk_assessments.risk_assessment_threats.map(({ threat_id, notes }) => ({ id: threat_id, notes })),
                vulnerabilities: plan.risk_assessments.risk_assessment_vulnerabilities.map(({ vulnerability_id, notes }) => ({ id: vulnerability_id, notes })),
              },
              strategy: plan.strategy,
              description: plan.description,
              ownerUserId: owner.user_id,
              ownerFullName: owner.full_name,
              targetDate: plan.target_date.toISOString(),
              actions: activeActions.map((action) => ({
                id: action.risk_treatment_action_id,
                title: action.title,
                assignedToUserId: action.assigned_to_user_id,
                dueDate: action.due_date?.toISOString() ?? null,
                progressPercent: action.progress_percent,
                status: action.status,
              })),
            },
          },
          select: {
            approval_request_id: true,
            current_step: true,
            status: true,
            submitted_at: true,
          },
        });
        await transaction.notifications.createMany({
          data: approvers.map((userId) => ({
            user_id: userId,
            type: 'approval_requested',
            title: 'Risk assessment and treatment plan awaiting approval',
            message: `${plan.risk_assessments.risk_code} — ${plan.risk_assessments.title}`,
            entity_type: 'risk_treatment_plan',
            entity_id: id,
          })),
        });
        await transaction.audit_logs.create({
          data: {
            actor_user_id: context.actorUserId,
            module: 'risk-management',
            action: 'risk-treatment-plan.submitted',
            entity_type: 'risk_treatment_plan',
            entity_id: id,
            before_data: {
              planStatus: plan.status,
              riskStatus: plan.risk_assessments.status,
              submittedAt: plan.submitted_at,
            },
            after_data: {
              planStatus: 'pending_approval',
              riskStatus: 'pending_approval',
              submittedAt,
              approvalRequestId: request.approval_request_id,
              workflowDefinitionId: workflow.workflow_definition_id,
              strategy: plan.strategy,
              ownerUserId: plan.owner_user_id,
              targetDate: plan.target_date,
              actionIds: activeActions.map(
                ({ risk_treatment_action_id }) => risk_treatment_action_id,
              ),
              submissionNote: input.submissionNote ?? null,
            },
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
          },
        });
        return {
          failure: null,
          result: {
            treatmentPlanId: id,
            riskAssessmentId: plan.risk_assessment_id,
            status: 'pending_approval' as const,
            submittedAt,
            approvalRequestId: request.approval_request_id,
            approvalStatus: request.status,
            currentStep: request.current_step,
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  },
  approveTreatmentPlan(
    id: string,
    input: ApproveTreatmentPlanBody,
    context: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ) {
    return prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`risk-treatment-plan:mutation:${id}`}, 0)
          )
        `;
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`risk-treatment-plan:approval:${input.approvalRequestId}`}, 0)
          )
        `;
        const now = new Date();
        const request = await transaction.approval_requests.findUnique({
          where: { approval_request_id: input.approvalRequestId },
          select: {
            approval_request_id: true,
            entity_type: true,
            entity_id: true,
            requested_by_user_id: true,
            current_step: true,
            status: true,
            entity_snapshot: true,
            workflow_definitions: {
              select: {
                workflow_steps: {
                  orderBy: { step_order: 'asc' },
                  take: 21,
                  select: {
                    workflow_step_id: true,
                    step_order: true,
                    name: true,
                    approver_role_id: true,
                    required_approvals: true,
                  },
                },
              },
            },
          },
        });
        if (!request || request.entity_type !== 'risk_treatment_plan' || request.entity_id !== id)
          return { failure: 'REQUEST_NOT_FOUND' as const, result: null };
        if (request.status !== 'pending')
          return { failure: 'REQUEST_NOT_PENDING' as const, result: null };
        if (request.requested_by_user_id === context.actorUserId)
          return { failure: 'SELF_APPROVAL' as const, result: null };
        const actor = await transaction.users.findFirst({
          where: { user_id: context.actorUserId, deleted_at: null, status: 'active' },
          select: {
            user_id: true,
            full_name: true,
            user_roles_user_roles_user_idTousers: { select: { role_id: true } },
          },
        });
        if (!actor) return { failure: 'ACTOR_INACTIVE' as const, result: null };
        const steps = request.workflow_definitions.workflow_steps;
        const step = steps.find(({ step_order }) => step_order === request.current_step);
        if (
          steps.length > 20 ||
          !step?.approver_role_id ||
          step.required_approvals < 1 ||
          steps.some((item, index) => item.step_order !== index + 1)
        )
          return { failure: 'WORKFLOW_INVALID' as const, result: null };
        const hasDirectRole = actor.user_roles_user_roles_user_idTousers.some(
          ({ role_id }) => role_id === step.approver_role_id,
        );
        const delegation = hasDirectRole
          ? null
          : await transaction.approval_delegations.findFirst({
              where: {
                delegate_user_id: context.actorUserId,
                is_active: true,
                start_at: { lte: now },
                end_at: { gte: now },
                users_approval_delegations_delegator_user_idTousers: {
                  deleted_at: null,
                  status: 'active',
                  user_roles_user_roles_user_idTousers: {
                    some: { role_id: step.approver_role_id },
                  },
                },
              },
              select: { approval_delegation_id: true, delegator_user_id: true },
            });
        if (!hasDirectRole && !delegation)
          return { failure: 'NOT_CURRENT_APPROVER' as const, result: null };
        const existingAction = await transaction.approval_actions.findFirst({
          where: {
            approval_request_id: request.approval_request_id,
            workflow_step_id: step.workflow_step_id,
            acted_by_user_id: context.actorUserId,
          },
          select: { approval_action_id: true },
        });
        if (existingAction) return { failure: 'ALREADY_DECIDED' as const, result: null };
        const plan = await transaction.risk_treatment_plans.findUnique({
          where: { risk_treatment_plan_id: id },
          select: {
            risk_treatment_plan_id: true,
            risk_assessment_id: true,
            strategy: true,
            description: true,
            owner_user_id: true,
            status: true,
            target_date: true,
            risk_assessments: {
              select: {
                risk_assessment_id: true,
                risk_code: true,
                title: true,
                status: true,
                likelihood: true,
                impact: true,
                risk_score: true,
                risk_level: true,
                assets: { select: { asset_id: true, asset_code: true, name: true, status: true, deleted_at: true } },
                business_processes: { select: { business_process_id: true, code: true, name: true, status: true } },
                risk_assessment_threats: {
                  orderBy: { threat_id: 'asc' },
                  select: { threat_id: true, notes: true },
                },
                risk_assessment_vulnerabilities: {
                  orderBy: { vulnerability_id: 'asc' },
                  select: { vulnerability_id: true, notes: true },
                },
              },
            },
            users_risk_treatment_plans_owner_user_idTousers: {
              select: { user_id: true, full_name: true, status: true, deleted_at: true },
            },
            risk_treatment_actions: {
              where: { status: { not: 'cancelled' } },
              orderBy: { risk_treatment_action_id: 'asc' },
              take: 101,
              select: {
                risk_treatment_action_id: true,
                title: true,
                assigned_to_user_id: true,
                due_date: true,
                progress_percent: true,
                status: true,
                users: { select: { status: true, deleted_at: true } },
              },
            },
          },
        });
        if (!plan) return { failure: 'PLAN_NOT_FOUND' as const, result: null };
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`risk-assessment:mutation:${plan.risk_assessment_id}`}, 0)
          )
        `;
        if (plan.status !== 'pending_approval')
          return { failure: 'PLAN_NOT_PENDING' as const, result: null };
        if (!request.entity_snapshot) return { failure: 'SNAPSHOT_MISSING' as const, result: null };
        const owner = plan.users_risk_treatment_plans_owner_user_idTousers;
        const currentSnapshot = {
          riskAssessment: {
            id: plan.risk_assessments.risk_assessment_id,
            code: plan.risk_assessments.risk_code,
            title: plan.risk_assessments.title,
            status: plan.risk_assessments.status,
            likelihood: plan.risk_assessments.likelihood,
            impact: plan.risk_assessments.impact,
            score: plan.risk_assessments.risk_score,
            level: plan.risk_assessments.risk_level,
            target: plan.risk_assessments.assets
              ? { type: 'asset', id: plan.risk_assessments.assets.asset_id, code: plan.risk_assessments.assets.asset_code, name: plan.risk_assessments.assets.name }
              : { type: 'businessProcess', id: plan.risk_assessments.business_processes?.business_process_id ?? '', code: plan.risk_assessments.business_processes?.code ?? '', name: plan.risk_assessments.business_processes?.name ?? '' },
            threats: plan.risk_assessments.risk_assessment_threats.map(({ threat_id, notes }) => ({ id: threat_id, notes })),
            vulnerabilities: plan.risk_assessments.risk_assessment_vulnerabilities.map(({ vulnerability_id, notes }) => ({ id: vulnerability_id, notes })),
          },
          strategy: plan.strategy,
          description: plan.description,
          ownerUserId: owner?.user_id ?? null,
          ownerFullName: owner?.full_name ?? null,
          targetDate: plan.target_date?.toISOString() ?? null,
          actions: plan.risk_treatment_actions.map((action) => ({
            id: action.risk_treatment_action_id,
            title: action.title,
            assignedToUserId: action.assigned_to_user_id,
            dueDate: action.due_date?.toISOString() ?? null,
            progressPercent: action.progress_percent,
            status: action.status,
          })),
        };
        if (
          JSON.stringify(canonicalJson(request.entity_snapshot)) !==
          JSON.stringify(canonicalJson(currentSnapshot))
        )
          return { failure: 'PLAN_CHANGED' as const, result: null };
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (
          plan.risk_assessments.status !== 'pending_approval' ||
          !plan.risk_assessments.risk_assessment_threats.length ||
          !plan.risk_assessments.risk_assessment_vulnerabilities.length ||
          (!plan.risk_assessments.assets && !plan.risk_assessments.business_processes) ||
          (plan.risk_assessments.assets &&
            (plan.risk_assessments.assets.deleted_at !== null ||
              plan.risk_assessments.assets.status === 'disposed')) ||
          (plan.risk_assessments.business_processes &&
            plan.risk_assessments.business_processes.status !== 'active') ||
          !owner ||
          owner.deleted_at ||
          owner.status !== 'active' ||
          !plan.target_date ||
          plan.target_date < today ||
          plan.risk_treatment_actions.length > 100 ||
          (plan.strategy !== 'accept' && plan.risk_treatment_actions.length === 0) ||
          plan.risk_treatment_actions.some(
            (action) =>
              !action.assigned_to_user_id ||
              !action.users ||
              action.users.deleted_at !== null ||
              action.users.status !== 'active' ||
              !action.due_date ||
              action.due_date < today ||
              action.due_date > (plan.target_date ?? today) ||
              action.status !== 'pending' ||
              action.progress_percent !== 0,
          )
        )
          return { failure: 'PLAN_INVALID' as const, result: null };
        await transaction.approval_actions.create({
          data: {
            approval_request_id: request.approval_request_id,
            workflow_step_id: step.workflow_step_id,
            acted_by_user_id: context.actorUserId,
            decision: 'approved',
            comment: input.comment ?? null,
            acted_at: now,
          },
        });
        const approvalCount = await transaction.approval_actions.count({
          where: {
            approval_request_id: request.approval_request_id,
            workflow_step_id: step.workflow_step_id,
            decision: 'approved',
          },
        });
        const stepCompleted = approvalCount >= step.required_approvals;
        const nextStep = stepCompleted
          ? steps.find(({ step_order }) => step_order === step.step_order + 1)
          : undefined;
        let approvalStatus = 'pending';
        let planStatus = plan.status;
        let currentStep = step.step_order;
        if (stepCompleted && nextStep) {
          currentStep = nextStep.step_order;
          await transaction.approval_requests.update({
            where: { approval_request_id: request.approval_request_id },
            data: { current_step: currentStep },
          });
          if (!nextStep.approver_role_id)
            return { failure: 'WORKFLOW_INVALID' as const, result: null };
          const [directNextApprovers, delegatedNextApprovers] = await Promise.all([
            transaction.users.findMany({
              where: {
                ...(request.requested_by_user_id && {
                  user_id: { not: request.requested_by_user_id },
                }),
                deleted_at: null,
                status: 'active',
                user_roles_user_roles_user_idTousers: {
                  some: { role_id: nextStep.approver_role_id },
                },
              },
              select: { user_id: true },
              take: 100,
            }),
            transaction.approval_delegations.findMany({
              where: {
                is_active: true,
                start_at: { lte: now },
                end_at: { gte: now },
                ...(request.requested_by_user_id && {
                  delegate_user_id: { not: request.requested_by_user_id },
                }),
                users_approval_delegations_delegator_user_idTousers: {
                  deleted_at: null,
                  status: 'active',
                  user_roles_user_roles_user_idTousers: {
                    some: { role_id: nextStep.approver_role_id },
                  },
                },
                users_approval_delegations_delegate_user_idTousers: {
                  deleted_at: null,
                  status: 'active',
                },
              },
              select: { delegate_user_id: true },
              take: 100,
            }),
          ]);
          const nextApproverIds = [
            ...new Set([
              ...directNextApprovers.map(({ user_id }) => user_id),
              ...delegatedNextApprovers.map(({ delegate_user_id }) => delegate_user_id),
            ]),
          ];
          if (nextApproverIds.length < nextStep.required_approvals)
            throw new RiskApprovalTransactionError('NO_ELIGIBLE_APPROVER');
          await transaction.notifications.createMany({
            data: nextApproverIds.map((user_id) => ({
              user_id,
              type: 'approval_requested',
              title: 'Risk assessment and treatment plan awaiting approval',
              message: `${plan.risk_assessments.risk_code} — ${plan.risk_assessments.title}`,
              entity_type: 'risk_treatment_plan',
              entity_id: id,
            })),
          });
        } else if (stepCompleted) {
          approvalStatus = 'approved';
          planStatus = 'approved';
          await Promise.all([
            transaction.approval_requests.update({
              where: { approval_request_id: request.approval_request_id },
              data: { status: approvalStatus, completed_at: now },
            }),
            transaction.risk_treatment_plans.update({
              where: { risk_treatment_plan_id: id },
              data: { status: planStatus, updated_at: now },
            }),
            transaction.risk_assessments.update({
              where: { risk_assessment_id: plan.risk_assessment_id },
              data: { status: 'approved', assessed_at: now, updated_at: now },
            }),
          ]);
          const recipients = [
            ...new Set(
              [request.requested_by_user_id, plan.owner_user_id].filter((value): value is string =>
                Boolean(value),
              ),
            ),
          ];
          if (recipients.length)
            await transaction.notifications.createMany({
              data: recipients.map((user_id) => ({
                user_id,
                type: 'approval_completed',
                title: 'Risk assessment and treatment plan approved',
                message: `${plan.risk_assessments.risk_code} — ${plan.risk_assessments.title}`,
                entity_type: 'risk_treatment_plan',
                entity_id: id,
              })),
            });
        }
        await transaction.audit_logs.create({
          data: {
            actor_user_id: context.actorUserId,
            module: 'risk-management',
            action: 'risk-treatment-plan.approved',
            entity_type: 'risk_treatment_plan',
            entity_id: id,
            before_data: {
              planStatus: plan.status,
              approvalStatus: request.status,
              currentStep: request.current_step,
            },
            after_data: {
              planStatus,
              riskStatus: stepCompleted && !nextStep ? 'approved' : plan.risk_assessments.status,
              approvalStatus,
              currentStep,
              approvedStep: step.step_order,
              approvalCount,
              requiredApprovals: step.required_approvals,
              comment: input.comment ?? null,
              delegatedForUserId: delegation?.delegator_user_id ?? null,
              delegationId: delegation?.approval_delegation_id ?? null,
            },
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
          },
        });
        return {
          failure: null,
          result: {
            treatmentPlanId: id,
            riskAssessmentId: plan.risk_assessment_id,
            approvalRequestId: request.approval_request_id,
            planStatus,
            approvalStatus,
            currentStep,
            stepCompleted,
            approvalCount,
            requiredApprovals: step.required_approvals,
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  },
  returnTreatmentPlanForRevision(
    id: string,
    input: ReturnTreatmentPlanForRevisionBody,
    context: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ) {
    return prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`risk-treatment-plan:mutation:${id}`}, 0)
          )
        `;
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`risk-treatment-plan:approval:${input.approvalRequestId}`}, 0)
          )
        `;

        const now = new Date();
        const request = await transaction.approval_requests.findUnique({
          where: { approval_request_id: input.approvalRequestId },
          select: {
            approval_request_id: true,
            entity_type: true,
            entity_id: true,
            requested_by_user_id: true,
            current_step: true,
            status: true,
            entity_snapshot: true,
            workflow_definitions: {
              select: {
                workflow_steps: {
                  orderBy: { step_order: 'asc' },
                  take: 21,
                  select: {
                    workflow_step_id: true,
                    step_order: true,
                    approver_role_id: true,
                  },
                },
              },
            },
          },
        });
        if (!request || request.entity_type !== 'risk_treatment_plan' || request.entity_id !== id)
          return { failure: 'REQUEST_NOT_FOUND' as const, result: null };
        if (request.status !== 'pending')
          return { failure: 'REQUEST_NOT_PENDING' as const, result: null };
        if (request.requested_by_user_id === context.actorUserId)
          return { failure: 'SELF_REVIEW' as const, result: null };

        const actor = await transaction.users.findFirst({
          where: { user_id: context.actorUserId, deleted_at: null, status: 'active' },
          select: {
            user_id: true,
            user_roles_user_roles_user_idTousers: { select: { role_id: true } },
          },
        });
        if (!actor) return { failure: 'ACTOR_INACTIVE' as const, result: null };

        const steps = request.workflow_definitions.workflow_steps;
        const step = steps.find(({ step_order }) => step_order === request.current_step);
        if (
          steps.length > 20 ||
          !step?.approver_role_id ||
          steps.some((item, index) => item.step_order !== index + 1)
        )
          return { failure: 'WORKFLOW_INVALID' as const, result: null };

        const hasDirectRole = actor.user_roles_user_roles_user_idTousers.some(
          ({ role_id }) => role_id === step.approver_role_id,
        );
        const delegation = hasDirectRole
          ? null
          : await transaction.approval_delegations.findFirst({
              where: {
                delegate_user_id: context.actorUserId,
                is_active: true,
                start_at: { lte: now },
                end_at: { gte: now },
                users_approval_delegations_delegator_user_idTousers: {
                  deleted_at: null,
                  status: 'active',
                  user_roles_user_roles_user_idTousers: {
                    some: { role_id: step.approver_role_id },
                  },
                },
              },
              select: { approval_delegation_id: true, delegator_user_id: true },
            });
        if (!hasDirectRole && !delegation)
          return { failure: 'NOT_CURRENT_APPROVER' as const, result: null };

        const existingAction = await transaction.approval_actions.findFirst({
          where: {
            approval_request_id: request.approval_request_id,
            workflow_step_id: step.workflow_step_id,
            acted_by_user_id: context.actorUserId,
          },
          select: { approval_action_id: true },
        });
        if (existingAction) return { failure: 'ALREADY_DECIDED' as const, result: null };

        const plan = await transaction.risk_treatment_plans.findUnique({
          where: { risk_treatment_plan_id: id },
          select: {
            risk_treatment_plan_id: true,
            risk_assessment_id: true,
            strategy: true,
            description: true,
            owner_user_id: true,
            created_by_user_id: true,
            status: true,
            target_date: true,
            risk_assessments: {
              select: {
                risk_assessment_id: true,
                risk_code: true,
                title: true,
                status: true,
                likelihood: true,
                impact: true,
                risk_score: true,
                risk_level: true,
                assets: {
                  select: { asset_id: true, asset_code: true, name: true },
                },
                business_processes: {
                  select: { business_process_id: true, code: true, name: true },
                },
                risk_assessment_threats: {
                  orderBy: { threat_id: 'asc' },
                  select: { threat_id: true, notes: true },
                },
                risk_assessment_vulnerabilities: {
                  orderBy: { vulnerability_id: 'asc' },
                  select: { vulnerability_id: true, notes: true },
                },
              },
            },
            users_risk_treatment_plans_owner_user_idTousers: {
              select: { user_id: true, full_name: true },
            },
            risk_treatment_actions: {
              where: { status: { not: 'cancelled' } },
              orderBy: { risk_treatment_action_id: 'asc' },
              take: 101,
              select: {
                risk_treatment_action_id: true,
                title: true,
                assigned_to_user_id: true,
                due_date: true,
                progress_percent: true,
                status: true,
              },
            },
          },
        });
        if (!plan) return { failure: 'PLAN_NOT_FOUND' as const, result: null };

        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`risk-assessment:mutation:${plan.risk_assessment_id}`}, 0)
          )
        `;
        if (plan.status !== 'pending_approval' || plan.risk_assessments.status !== 'pending_approval')
          return { failure: 'NOT_PENDING' as const, result: null };
        if (!request.entity_snapshot) return { failure: 'SNAPSHOT_MISSING' as const, result: null };

        const owner = plan.users_risk_treatment_plans_owner_user_idTousers;
        const currentSnapshot = {
          riskAssessment: {
            id: plan.risk_assessments.risk_assessment_id,
            code: plan.risk_assessments.risk_code,
            title: plan.risk_assessments.title,
            status: plan.risk_assessments.status,
            likelihood: plan.risk_assessments.likelihood,
            impact: plan.risk_assessments.impact,
            score: plan.risk_assessments.risk_score,
            level: plan.risk_assessments.risk_level,
            target: plan.risk_assessments.assets
              ? {
                  type: 'asset',
                  id: plan.risk_assessments.assets.asset_id,
                  code: plan.risk_assessments.assets.asset_code,
                  name: plan.risk_assessments.assets.name,
                }
              : {
                  type: 'businessProcess',
                  id: plan.risk_assessments.business_processes?.business_process_id ?? '',
                  code: plan.risk_assessments.business_processes?.code ?? '',
                  name: plan.risk_assessments.business_processes?.name ?? '',
                },
            threats: plan.risk_assessments.risk_assessment_threats.map(
              ({ threat_id, notes }) => ({ id: threat_id, notes }),
            ),
            vulnerabilities: plan.risk_assessments.risk_assessment_vulnerabilities.map(
              ({ vulnerability_id, notes }) => ({ id: vulnerability_id, notes }),
            ),
          },
          strategy: plan.strategy,
          description: plan.description,
          ownerUserId: owner?.user_id ?? null,
          ownerFullName: owner?.full_name ?? null,
          targetDate: plan.target_date?.toISOString() ?? null,
          actions: plan.risk_treatment_actions.map((action) => ({
            id: action.risk_treatment_action_id,
            title: action.title,
            assignedToUserId: action.assigned_to_user_id,
            dueDate: action.due_date?.toISOString() ?? null,
            progressPercent: action.progress_percent,
            status: action.status,
          })),
        };
        if (
          JSON.stringify(canonicalJson(request.entity_snapshot)) !==
          JSON.stringify(canonicalJson(currentSnapshot))
        )
          return { failure: 'SUBMISSION_CHANGED' as const, result: null };

        const storedReason = `Revision scope: ${input.revisionScope}\nReason: ${input.reason}`;
        await Promise.all([
          transaction.approval_actions.create({
            data: {
              approval_request_id: request.approval_request_id,
              workflow_step_id: step.workflow_step_id,
              acted_by_user_id: context.actorUserId,
              decision: 'returned',
              comment: storedReason,
              acted_at: now,
            },
          }),
          transaction.approval_requests.update({
            where: { approval_request_id: request.approval_request_id },
            data: { status: 'rejected', completed_at: now },
          }),
          transaction.risk_treatment_plans.update({
            where: { risk_treatment_plan_id: id },
            data: { status: 'rejected', updated_at: now },
          }),
          transaction.risk_assessments.update({
            where: { risk_assessment_id: plan.risk_assessment_id },
            data: { status: 'rejected', assessed_at: null, updated_at: now },
          }),
        ]);

        const recipients = [
          ...new Set(
            [request.requested_by_user_id, plan.owner_user_id, plan.created_by_user_id].filter(
              (value): value is string => Boolean(value) && value !== context.actorUserId,
            ),
          ),
        ];
        if (recipients.length)
          await transaction.notifications.createMany({
            data: recipients.map((user_id) => ({
              user_id,
              type: 'approval_rejected',
              title: 'Risk assessment and treatment plan returned for revision',
              message: `${plan.risk_assessments.risk_code} - ${input.reason}`,
              entity_type: 'risk_treatment_plan',
              entity_id: id,
            })),
          });

        await transaction.audit_logs.create({
          data: {
            actor_user_id: context.actorUserId,
            module: 'risk-management',
            action: 'risk-treatment-plan.returned-for-revision',
            entity_type: 'risk_treatment_plan',
            entity_id: id,
            before_data: {
              planStatus: plan.status,
              riskStatus: plan.risk_assessments.status,
              approvalStatus: request.status,
              currentStep: request.current_step,
            },
            after_data: {
              planStatus: 'rejected',
              riskStatus: 'rejected',
              approvalStatus: 'rejected',
              revisionScope: input.revisionScope,
              reason: input.reason,
              delegatedForUserId: delegation?.delegator_user_id ?? null,
              delegationId: delegation?.approval_delegation_id ?? null,
            },
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
          },
        });

        return {
          failure: null,
          result: {
            treatmentPlanId: id,
            riskAssessmentId: plan.risk_assessment_id,
            approvalRequestId: request.approval_request_id,
            planStatus: 'rejected' as const,
            riskStatus: 'rejected' as const,
            approvalStatus: 'rejected' as const,
            revisionScope: input.revisionScope,
            reason: input.reason,
            returnedAt: now,
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  },
  cancel(
    id: string,
    input: CancelRiskAssessmentBody,
    before: RiskAssessmentDetailRecord,
    context: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ) {
    return prisma.$transaction(async (transaction) => {
      const now = new Date();
      const [actor, current] = await Promise.all([
        transaction.users.findFirst({
          where: { user_id: context.actorUserId, deleted_at: null, status: 'active' },
          select: { full_name: true },
        }),
        transaction.risk_assessments.findUnique({
          where: { risk_assessment_id: id },
          select: {
            status: true,
            updated_at: true,
            _count: {
              select: {
                risk_treatment_plans: true,
                incident_risk_links: true,
                other_risk_assessments: true,
              },
            },
          },
        }),
      ]);
      if (!actor) return { failure: 'ACTOR_INACTIVE' as const, cancelled: null };
      if (!current) return { failure: 'RISK_ASSESSMENT_CHANGED' as const, cancelled: null };
      if (!['draft', 'rejected'].includes(current.status))
        return { failure: 'RISK_NOT_CANCELLABLE' as const, cancelled: null };
      if (current._count.risk_treatment_plans)
        return { failure: 'RISK_HAS_TREATMENT_PLAN' as const, cancelled: null };
      if (current._count.incident_risk_links)
        return { failure: 'RISK_LINKED_TO_INCIDENT' as const, cancelled: null };
      if (current._count.other_risk_assessments)
        return { failure: 'RISK_HAS_SUCCESSOR' as const, cancelled: null };
      if (current.updated_at.getTime() !== new Date(input.expectedUpdatedAt).getTime())
        return { failure: 'RISK_ASSESSMENT_CHANGED' as const, cancelled: null };
      const changed = await transaction.risk_assessments.updateMany({
        where: {
          risk_assessment_id: id,
          updated_at: new Date(input.expectedUpdatedAt),
          status: { in: ['draft', 'rejected'] },
          risk_treatment_plans: { none: {} },
          incident_risk_links: { none: {} },
          other_risk_assessments: { none: {} },
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
      if (changed.count !== 1)
        return { failure: 'RISK_ASSESSMENT_CHANGED' as const, cancelled: null };
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
      return { failure: null, cancelled };
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
      const normalizedTitle = input.title.normalize('NFKC').replace(/\s+/gu, ' ').toLowerCase();
      const targetKey = input.assetId
        ? `asset:${input.assetId}`
        : `business-process:${input.businessProcessId ?? ''}`;
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`risk-assessment:create:${targetKey}:${normalizedTitle}`}, 0)
        )
      `;
      if (
        before.status === 'rejected' &&
        (before.assets?.asset_id !== (input.assetId ?? null) ||
          before.business_processes?.business_process_id !== (input.businessProcessId ?? null))
      )
        return { failure: 'TARGET_LOCKED' as const, duplicate: null, updated: null };
      const [
        assessor,
        targetCount,
        threatCount,
        vulnerabilityCount,
        treatmentCount,
        incidentLinkCount,
        duplicate,
      ] = await Promise.all([
        transaction.users.count({
          where: { user_id: context.actorUserId, deleted_at: null, status: 'active' },
        }),
        input.assetId
          ? transaction.assets.count({
              where: { asset_id: input.assetId, deleted_at: null, status: { not: 'disposed' } },
            })
          : transaction.business_processes.count({
              where: { business_process_id: input.businessProcessId ?? '', status: 'active' },
            }),
        transaction.threats.count({
          where: { threat_id: { in: input.threats.map(({ threatId }) => threatId) } },
        }),
        transaction.vulnerabilities.count({
          where: {
            vulnerability_id: {
              in: input.vulnerabilities.map(({ vulnerabilityId }) => vulnerabilityId),
            },
          },
        }),
        transaction.risk_treatment_plans.count({
          where: {
            risk_assessment_id: id,
            status: { notIn: ['rejected', 'cancelled'] },
          },
        }),
        transaction.incident_risk_links.count({ where: { risk_assessment_id: id } }),
        transaction.risk_assessments.findFirst({
          where: {
            risk_assessment_id: { not: id },
            title: { equals: input.title, mode: 'insensitive' },
            ...(input.assetId
              ? { asset_id: input.assetId }
              : { business_process_id: input.businessProcessId ?? '' }),
            status: {
              in: ['draft', 'pending_approval', 'approved', 'in_treatment', 'rejected'],
            },
          },
          select: { risk_code: true },
        }),
      ]);
      if (!assessor)
        return { failure: 'ASSESSOR_INACTIVE' as const, duplicate: null, updated: null };
      if (!targetCount)
        return { failure: 'TARGET_INVALID' as const, duplicate: null, updated: null };
      if (threatCount !== input.threats.length)
        return { failure: 'THREAT_NOT_FOUND' as const, duplicate: null, updated: null };
      if (vulnerabilityCount !== input.vulnerabilities.length)
        return { failure: 'VULNERABILITY_NOT_FOUND' as const, duplicate: null, updated: null };
      if (treatmentCount)
        return { failure: 'RISK_HAS_TREATMENT_PLAN' as const, duplicate: null, updated: null };
      if (incidentLinkCount)
        return { failure: 'RISK_LINKED_TO_INCIDENT' as const, duplicate: null, updated: null };
      if (duplicate) return { failure: null, duplicate, updated: null };
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
      if (changed.count !== 1)
        return { failure: 'RISK_ASSESSMENT_CHANGED' as const, duplicate: null, updated: null };
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
      return { failure: null, duplicate: null, updated };
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
      await transaction.$executeRaw`
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
  async findById(riskAssessmentId: string): Promise<RiskAssessmentDetailWithApprovals | null> {
    const risk = await prisma.risk_assessments.findUnique({
      where: { risk_assessment_id: riskAssessmentId },
      select: riskAssessmentDetailSelect,
    });
    if (!risk) return null;
    const planIds = risk.risk_treatment_plans.map(
      ({ risk_treatment_plan_id }) => risk_treatment_plan_id,
    );
    const treatmentPlanApprovals = planIds.length
      ? await prisma.approval_requests.findMany({
          where: { entity_type: 'risk_treatment_plan', entity_id: { in: planIds } },
          select: treatmentPlanApprovalSelect,
          orderBy: [{ submitted_at: 'desc' }, { approval_request_id: 'asc' }],
          take: 100,
        })
      : [];
    return { ...risk, treatmentPlanApprovals };
  },
} as const;
