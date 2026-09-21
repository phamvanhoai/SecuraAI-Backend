import { AppError } from '../../common/errors/app-error.js';
import type { ListRiskAssessmentsQuery } from './dto/list-risk-assessments-query.dto.js';
import { toRiskAssessmentListItem } from './risk-management.mapper.js';
import { toRiskAssessmentDetail } from './risk-management.mapper.js';
import type { CreateRiskAssessmentBody } from './dto/create-risk-assessment.dto.js';
import { randomUUID } from 'node:crypto';
import {
  RiskApprovalTransactionError,
  riskManagementRepository,
} from './risk-management.repository.js';
import type { UpdateRiskAssessmentBody } from './dto/update-risk-assessment.dto.js';
import type { CancelRiskAssessmentBody } from './dto/cancel-risk-assessment.dto.js';
import { Prisma } from '@prisma/client';
import type { RiskCreateOptionsQuery } from './dto/risk-create-options-query.dto.js';
import type { SubmitTreatmentPlanBody } from './dto/submit-treatment-plan.dto.js';
import type { ApproveTreatmentPlanBody } from './dto/approve-treatment-plan.dto.js';
import type { ListTreatmentPlansQuery } from './dto/list-treatment-plans-query.dto.js';
import { toTreatmentPlanDetail, toTreatmentPlanListItem } from './risk-management.mapper.js';
import type {
  CreateTreatmentPlanBody,
  TreatmentPlanCreateOptionsQuery,
} from './dto/create-treatment-plan.dto.js';
import type { UpdateTreatmentPlanBody } from './dto/update-treatment-plan.dto.js';
import type { CancelTreatmentPlanBody } from './dto/cancel-treatment-plan.dto.js';

const isRiskCodeConflict = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
    return false;
  const target = error.meta?.['target'];
  if (typeof target === 'string') return target.includes('risk_code');
  return Array.isArray(target) && target.some((column) => column === 'risk_code');
};

export const riskManagementService = {
  async cancelTreatmentPlan(
    treatmentPlanId: string,
    input: CancelTreatmentPlanBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risk-treatment-plans.cancel'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    let result: Awaited<ReturnType<typeof riskManagementRepository.cancelTreatmentPlan>>;
    try {
      result = await riskManagementRepository.cancelTreatmentPlan(treatmentPlanId, input, {
        actorUserId: actor.userId,
        actorIsAdmin: actor.roles.includes('ADMIN'),
        ...context,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(
          409,
          'TREATMENT_PLAN_CANCEL_CONFLICT',
          'The treatment plan changed while it was being cancelled. Reload and try again',
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028')
        throw new AppError(
          503,
          'TREATMENT_PLAN_CANCEL_TEMPORARILY_UNAVAILABLE',
          'Treatment plan cancellation timed out. Please try again',
        );
      throw error;
    }
    const failures = {
      ACTOR_INACTIVE: [403, 'ACTOR_INACTIVE', 'The current user cannot cancel treatment plans'],
      PLAN_NOT_FOUND: [404, 'TREATMENT_PLAN_NOT_FOUND', 'Risk treatment plan was not found'],
      NOT_PLAN_MANAGER: [403, 'FORBIDDEN', 'Only the plan creator, owner, or an administrator can cancel this plan'],
      PLAN_NOT_CANCELLABLE: [409, 'TREATMENT_PLAN_NOT_CANCELLABLE', 'Only draft or rejected treatment plans can be cancelled'],
      RISK_NOT_CANCELLABLE: [409, 'RISK_ASSESSMENT_NOT_CANCELLABLE', 'The linked risk assessment is no longer editable'],
      PLAN_CHANGED: [409, 'TREATMENT_PLAN_CHANGED', 'The treatment plan changed. Reload and try again'],
      ACTION_ALREADY_STARTED: [409, 'TREATMENT_ACTION_ALREADY_STARTED', 'A plan with started or completed actions cannot be cancelled'],
    } as const;
    if (result.failure) {
      const [status, code, message] = failures[result.failure];
      throw new AppError(status, code, message);
    }
    if (!result.plan)
      throw new AppError(500, 'TREATMENT_PLAN_CANCEL_FAILED', 'Unable to cancel treatment plan');
    return toTreatmentPlanDetail(result.plan);
  },
  async updateTreatmentPlan(
    treatmentPlanId: string,
    input: UpdateTreatmentPlanBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risk-treatment-plans.update'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    let result: Awaited<ReturnType<typeof riskManagementRepository.updateTreatmentPlan>>;
    try {
      result = await riskManagementRepository.updateTreatmentPlan(treatmentPlanId, input, {
        actorUserId: actor.userId,
        actorIsAdmin: actor.roles.includes('ADMIN'),
        ...context,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(
          409,
          'TREATMENT_PLAN_UPDATE_CONFLICT',
          'The treatment plan changed while it was being updated. Reload and try again',
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028')
        throw new AppError(
          503,
          'TREATMENT_PLAN_UPDATE_TEMPORARILY_UNAVAILABLE',
          'Treatment plan update timed out. Please try again',
        );
      throw error;
    }
    const failures = {
      ACTOR_INACTIVE: [403, 'ACTOR_INACTIVE', 'The current user cannot update treatment plans'],
      PLAN_NOT_FOUND: [404, 'TREATMENT_PLAN_NOT_FOUND', 'Risk treatment plan was not found'],
      NOT_PLAN_MANAGER: [403, 'FORBIDDEN', 'Only the plan creator, owner, or an administrator can update this plan'],
      PLAN_NOT_EDITABLE: [409, 'TREATMENT_PLAN_NOT_EDITABLE', 'Only draft or rejected treatment plans can be updated'],
      RISK_NOT_EDITABLE: [409, 'RISK_ASSESSMENT_NOT_EDITABLE', 'The linked risk assessment is no longer editable'],
      RISK_TARGET_INVALID: [422, 'RISK_TARGET_INVALID', 'The assessment target is no longer active'],
      PLAN_CHANGED: [409, 'TREATMENT_PLAN_CHANGED', 'The treatment plan changed. Reload and try again'],
      ACTION_NOT_IN_PLAN: [422, 'TREATMENT_ACTION_INVALID', 'A treatment action does not belong to this plan'],
      ACTION_ALREADY_STARTED: [409, 'TREATMENT_ACTION_ALREADY_STARTED', 'A started or completed action cannot be removed'],
      USER_INACTIVE: [422, 'TREATMENT_PLAN_USER_INVALID', 'The owner and all assignees must be active users'],
      TARGET_DATE_PAST: [422, 'TARGET_DATE_IN_PAST', 'The target date cannot be in the past'],
      ACTION_DUE_DATE_PAST: [422, 'ACTION_DUE_DATE_IN_PAST', 'Action due dates cannot be in the past'],
    } as const;
    if (result.failure) {
      const [status, code, message] = failures[result.failure];
      throw new AppError(status, code, message);
    }
    if (!result.plan) throw new AppError(500, 'TREATMENT_PLAN_UPDATE_FAILED', 'Unable to update treatment plan');
    return toTreatmentPlanDetail(result.plan);
  },
  async listTreatmentPlanCreateOptions(
    query: TreatmentPlanCreateOptionsQuery,
    actor: { permissions: readonly string[] },
  ) {
    if (!actor.permissions.includes('risk-treatment-plans.create'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await riskManagementRepository.listTreatmentPlanCreateOptions(query);
    return {
      items: result.items.map((user) => ({
        id: user.user_id,
        fullName: user.full_name,
        employeeCode: user.employee_code,
        departmentId: user.department_id,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },

  async createTreatmentPlan(
    input: CreateTreatmentPlanBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risk-treatment-plans.create'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    let result: Awaited<ReturnType<typeof riskManagementRepository.createTreatmentPlan>>;
    try {
      result = await riskManagementRepository.createTreatmentPlan(input, {
        actorUserId: actor.userId,
        actorIsAdmin: actor.roles.includes('ADMIN'),
        ...context,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(
          409,
          'TREATMENT_PLAN_CREATE_CONFLICT',
          'The risk assessment changed while the plan was being created. Reload and try again',
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028')
        throw new AppError(
          503,
          'TREATMENT_PLAN_CREATE_TEMPORARILY_UNAVAILABLE',
          'Treatment plan creation timed out. Please try again',
        );
      throw error;
    }
    const failures = {
      ACTOR_INACTIVE: [403, 'ACTOR_INACTIVE', 'The current user cannot create treatment plans'],
      RISK_NOT_FOUND: [404, 'RISK_ASSESSMENT_NOT_FOUND', 'Risk assessment was not found'],
      NOT_RISK_ASSESSOR: [403, 'FORBIDDEN', 'Only the assessor or an administrator can create this plan'],
      RISK_STATUS_INVALID: [409, 'RISK_STATUS_INVALID', 'Only draft or rejected assessments can receive a treatment plan'],
      RISK_TARGET_INVALID: [422, 'RISK_TARGET_INVALID', 'The assessment target is no longer active'],
      RISK_CHANGED: [409, 'RISK_ASSESSMENT_CHANGED', 'The risk assessment changed. Reload and try again'],
      RISK_ANALYSIS_INCOMPLETE: [422, 'RISK_ANALYSIS_INCOMPLETE', 'The assessment requires at least one threat and one vulnerability'],
      PLAN_ALREADY_EXISTS: [409, 'TREATMENT_PLAN_ALREADY_EXISTS', 'This risk assessment already has a treatment plan'],
      USER_INACTIVE: [422, 'TREATMENT_PLAN_USER_INVALID', 'The owner and all assignees must be active users'],
      TARGET_DATE_PAST: [422, 'TARGET_DATE_IN_PAST', 'The target date cannot be in the past'],
      ACTION_DUE_DATE_PAST: [422, 'ACTION_DUE_DATE_IN_PAST', 'Action due dates cannot be in the past'],
    } as const;
    if (result.failure) {
      const [status, code, message] = failures[result.failure];
      throw new AppError(status, code, message);
    }
    if (!result.plan)
      throw new AppError(500, 'TREATMENT_PLAN_CREATE_FAILED', 'Unable to create treatment plan');
    return toTreatmentPlanDetail(result.plan);
  },

  async getTreatmentPlanById(treatmentPlanId: string, actor: { permissions: readonly string[] }) {
    if (!actor.permissions.includes('risk-treatment-plans.read'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const plan = await riskManagementRepository.findTreatmentPlanDetail(treatmentPlanId);
    if (!plan)
      throw new AppError(404, 'TREATMENT_PLAN_NOT_FOUND', 'Risk treatment plan was not found');
    return toTreatmentPlanDetail(plan);
  },
  async listTreatmentPlans(
    query: ListTreatmentPlansQuery,
    actor: { permissions: readonly string[] },
  ) {
    if (!actor.permissions.includes('risk-treatment-plans.read'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await riskManagementRepository.listTreatmentPlans(query);
    return {
      items: result.items.map(toTreatmentPlanListItem),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  async approveTreatmentPlan(
    treatmentPlanId: string,
    input: ApproveTreatmentPlanBody,
    actor: { userId: string; permissions: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risk-treatment-plans.approve'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    let approval: Awaited<ReturnType<typeof riskManagementRepository.approveTreatmentPlan>>;
    try {
      approval = await riskManagementRepository.approveTreatmentPlan(treatmentPlanId, input, {
        actorUserId: actor.userId,
        ...context,
      });
    } catch (error: unknown) {
      if (error instanceof RiskApprovalTransactionError)
        throw new AppError(
          422,
          'NO_ELIGIBLE_APPROVER',
          'The next workflow step does not have enough active approvers',
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError(
          409,
          'APPROVAL_ALREADY_RECORDED',
          'You already approved this workflow step',
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(
          409,
          'APPROVAL_STATE_CHANGED',
          'The approval changed. Reload and try again',
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028')
        throw new AppError(
          503,
          'APPROVAL_TEMPORARILY_UNAVAILABLE',
          'Approval timed out. Please try again',
        );
      throw error;
    }
    const failures = {
      REQUEST_NOT_FOUND: [404, 'APPROVAL_REQUEST_NOT_FOUND', 'Approval request was not found'],
      REQUEST_NOT_PENDING: [
        409,
        'APPROVAL_REQUEST_NOT_PENDING',
        'This approval request is no longer pending',
      ],
      SELF_APPROVAL: [
        403,
        'SELF_APPROVAL_NOT_ALLOWED',
        'You cannot approve a plan that you submitted',
      ],
      ACTOR_INACTIVE: [403, 'APPROVER_INACTIVE', 'The current user cannot approve treatment plans'],
      WORKFLOW_INVALID: [422, 'APPROVAL_WORKFLOW_INVALID', 'The approval workflow is invalid'],
      NOT_CURRENT_APPROVER: [
        403,
        'NOT_CURRENT_APPROVER',
        'You are not an eligible approver for the current step',
      ],
      ALREADY_DECIDED: [
        409,
        'APPROVAL_ALREADY_RECORDED',
        'You already approved this workflow step',
      ],
      PLAN_NOT_FOUND: [404, 'TREATMENT_PLAN_NOT_FOUND', 'Risk treatment plan was not found'],
      PLAN_NOT_PENDING: [
        409,
        'TREATMENT_PLAN_NOT_PENDING_APPROVAL',
        'This treatment plan is not awaiting approval',
      ],
      SNAPSHOT_MISSING: [
        409,
        'APPROVAL_SNAPSHOT_MISSING',
        'This legacy request must be resubmitted before approval',
      ],
      PLAN_CHANGED: [
        409,
        'TREATMENT_PLAN_CHANGED_AFTER_SUBMISSION',
        'The treatment plan changed after submission and cannot be approved',
      ],
      PLAN_INVALID: [
        422,
        'TREATMENT_PLAN_NO_LONGER_VALID',
        'The treatment plan no longer satisfies approval requirements',
      ],
      NO_ELIGIBLE_APPROVER: [
        422,
        'NO_ELIGIBLE_APPROVER',
        'The next workflow step does not have enough active approvers',
      ],
    } as const;
    if (approval.failure) {
      const [status, code, message] = failures[approval.failure];
      throw new AppError(status, code, message);
    }
    if (!approval.result)
      throw new AppError(500, 'TREATMENT_PLAN_APPROVAL_FAILED', 'Unable to approve treatment plan');
    return approval.result;
  },
  async submitTreatmentPlan(
    treatmentPlanId: string,
    input: SubmitTreatmentPlanBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risk-treatment-plans.submit'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const current = await riskManagementRepository.findTreatmentPlanForSubmission(treatmentPlanId);
    if (!current)
      throw new AppError(404, 'TREATMENT_PLAN_NOT_FOUND', 'Risk treatment plan was not found');
    const isAdmin = actor.roles.includes('ADMIN');
    if (
      !isAdmin &&
      current.created_by_user_id !== actor.userId &&
      current.owner_user_id !== actor.userId
    )
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only the plan creator, plan owner, or an administrator can submit this plan',
      );
    let submission: Awaited<ReturnType<typeof riskManagementRepository.submitTreatmentPlan>>;
    try {
      submission = await riskManagementRepository.submitTreatmentPlan(treatmentPlanId, input, {
        actorUserId: actor.userId,
        actorIsAdmin: isAdmin,
        ...context,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError(
          409,
          'TREATMENT_PLAN_ALREADY_SUBMITTED',
          'This treatment plan already has a pending approval request',
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(
          409,
          'TREATMENT_PLAN_CHANGED',
          'This treatment plan changed while it was being submitted. Reload and try again',
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028')
        throw new AppError(
          503,
          'TREATMENT_PLAN_SUBMISSION_TEMPORARILY_UNAVAILABLE',
          'Treatment plan submission timed out. Please try again',
        );
      throw error;
    }
    const failures = {
      ACTOR_INACTIVE: [403, 'ACTOR_INACTIVE', 'The current user cannot submit treatment plans'],
      PLAN_NOT_FOUND: [404, 'TREATMENT_PLAN_NOT_FOUND', 'Risk treatment plan was not found'],
      NOT_PLAN_OWNER: [
        403,
        'FORBIDDEN',
        'Only the plan creator, plan owner, or an administrator can submit this plan',
      ],
      PLAN_NOT_SUBMITTABLE: [
        409,
        'TREATMENT_PLAN_NOT_SUBMITTABLE',
        'Only draft or rejected treatment plans can be submitted',
      ],
      RISK_NOT_APPROVED: [
        422,
        'RISK_NOT_SUBMITTABLE',
        'Only a draft or rejected risk assessment can be submitted with its treatment plan',
      ],
      RISK_STATE_CHANGED: [
        409,
        'RISK_ASSESSMENT_CHANGED',
        'The risk assessment changed while the treatment plan was being submitted',
      ],
      DESCRIPTION_REQUIRED: [
        422,
        'TREATMENT_DESCRIPTION_REQUIRED',
        'Provide a meaningful treatment plan description',
      ],
      OWNER_INACTIVE: [
        422,
        'TREATMENT_OWNER_INVALID',
        'Assign an active owner before submitting the plan',
      ],
      TARGET_DATE_REQUIRED: [
        422,
        'TREATMENT_TARGET_DATE_REQUIRED',
        'Set a target date before submitting the plan',
      ],
      TARGET_DATE_IN_PAST: [
        422,
        'TREATMENT_TARGET_DATE_IN_PAST',
        'The treatment plan target date cannot be in the past',
      ],
      ACTIONS_REQUIRED: [
        422,
        'TREATMENT_ACTIONS_REQUIRED',
        'This treatment strategy requires at least one active action',
      ],
      TOO_MANY_ACTIONS: [
        422,
        'TOO_MANY_TREATMENT_ACTIONS',
        'A treatment plan cannot be submitted with more than 100 actions',
      ],
      ACTION_ASSIGNEE_INVALID: [
        422,
        'TREATMENT_ACTION_ASSIGNEE_INVALID',
        'Every active treatment action must have an active assignee',
      ],
      ACTION_DUE_DATE_REQUIRED: [
        422,
        'TREATMENT_ACTION_DUE_DATE_REQUIRED',
        'Every active treatment action must have a due date',
      ],
      ACTION_DUE_DATE_INVALID: [
        422,
        'TREATMENT_ACTION_DUE_DATE_INVALID',
        'Action due dates must be current and no later than the plan target date',
      ],
      ACTION_ALREADY_STARTED: [
        409,
        'TREATMENT_ACTION_ALREADY_STARTED',
        'Actions must be pending with zero progress when the plan is submitted',
      ],
      ALREADY_SUBMITTED: [
        409,
        'TREATMENT_PLAN_ALREADY_SUBMITTED',
        'This treatment plan already has a pending approval request',
      ],
      OTHER_ACTIVE_PLAN: [
        409,
        'RISK_HAS_ACTIVE_TREATMENT_PLAN',
        'This risk assessment already has another active treatment plan',
      ],
      WORKFLOW_NOT_CONFIGURED: [
        422,
        'APPROVAL_WORKFLOW_NOT_CONFIGURED',
        'No active approval workflow is configured for risk treatment plans',
      ],
      WORKFLOW_INVALID: [
        422,
        'APPROVAL_WORKFLOW_INVALID',
        'The risk treatment approval workflow is invalid',
      ],
      MULTIPLE_ACTIVE_WORKFLOWS: [
        422,
        'MULTIPLE_ACTIVE_APPROVAL_WORKFLOWS',
        'More than one active approval workflow is configured for risk treatment plans',
      ],
      NO_ELIGIBLE_APPROVER: [
        422,
        'NO_ELIGIBLE_APPROVER',
        'One or more workflow steps do not have enough active independent approvers',
      ],
      PLAN_CHANGED: [
        409,
        'TREATMENT_PLAN_CHANGED',
        'This treatment plan changed after it was loaded. Reload it before submitting',
      ],
    } as const;
    if (submission.failure) {
      const [status, code, message] = failures[submission.failure];
      throw new AppError(status, code, message);
    }
    if (!submission.result)
      throw new AppError(
        500,
        'TREATMENT_PLAN_SUBMISSION_FAILED',
        'Unable to submit treatment plan',
      );
    return submission.result;
  },
  async cancel(
    riskAssessmentId: string,
    input: CancelRiskAssessmentBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risks.cancel'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const current = await riskManagementRepository.findById(riskAssessmentId);
    if (!current)
      throw new AppError(404, 'RISK_ASSESSMENT_NOT_FOUND', 'Risk assessment was not found');
    if (current.assessed_by_user_id !== actor.userId && !actor.roles.includes('ADMIN'))
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only the assessor or an administrator can cancel this risk assessment',
      );
    if (!['draft', 'rejected'].includes(current.status))
      throw new AppError(
        422,
        'RISK_NOT_CANCELLABLE',
        'Only draft or rejected risk assessments can be cancelled',
      );
    if (current.risk_treatment_plans.length > 0)
      throw new AppError(
        409,
        'RISK_HAS_TREATMENT_PLAN',
        'A risk assessment with a treatment plan cannot be cancelled',
      );
    const result = await riskManagementRepository.cancel(riskAssessmentId, input, current, {
      actorUserId: actor.userId,
      ...context,
    });
    if (result.failure === 'ACTOR_INACTIVE')
      throw new AppError(403, 'ACTOR_INACTIVE', 'The current user cannot cancel assessments');
    if (result.failure === 'RISK_NOT_CANCELLABLE')
      throw new AppError(
        422,
        'RISK_NOT_CANCELLABLE',
        'Only draft or rejected risk assessments can be cancelled',
      );
    if (result.failure === 'RISK_HAS_TREATMENT_PLAN')
      throw new AppError(
        409,
        'RISK_HAS_TREATMENT_PLAN',
        'A risk assessment with a treatment plan cannot be cancelled',
      );
    if (result.failure === 'RISK_LINKED_TO_INCIDENT')
      throw new AppError(
        409,
        'RISK_LINKED_TO_INCIDENT',
        'A risk assessment linked to an incident cannot be cancelled',
      );
    if (result.failure === 'RISK_HAS_SUCCESSOR')
      throw new AppError(
        409,
        'RISK_HAS_SUCCESSOR',
        'A risk assessment referenced by a later assessment cannot be cancelled',
      );
    if (result.failure === 'RISK_ASSESSMENT_CHANGED' || !result.cancelled)
      throw new AppError(
        409,
        'RISK_ASSESSMENT_CHANGED',
        'This risk assessment was modified by another user. Reload it before cancelling',
      );
    return toRiskAssessmentDetail(result.cancelled);
  },
  async listCreateOptions(
    query: RiskCreateOptionsQuery,
    actor: { permissions: readonly string[] },
  ) {
    if (!actor.permissions.includes('risks.create') && !actor.permissions.includes('risks.update'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const options = await riskManagementRepository.listCreateOptions(query);
    const pagination = {
      page: query.page,
      limit: query.limit,
      total: options.total,
      totalPages: Math.ceil(options.total / query.limit),
    };
    if (options.type === 'assets')
      return {
        type: options.type,
        items: options.items.map((item) => ({
          id: item.asset_id,
          code: item.asset_code,
          name: item.name,
        })),
        pagination,
      };
    if (options.type === 'businessProcesses')
      return {
        type: options.type,
        items: options.items.map((item) => ({
          id: item.business_process_id,
          code: item.code,
          name: item.name,
        })),
        pagination,
      };
    if (options.type === 'threats')
      return {
        type: options.type,
        items: options.items.map((item) => ({
          id: item.threat_id,
          code: item.code,
          name: item.name,
        })),
        pagination,
      };
    return {
      type: options.type,
      items: options.items.map((item) => ({
        id: item.vulnerability_id,
        code: item.code,
        name: item.name,
        severity: item.severity,
      })),
      pagination,
    };
  },
  async create(
    input: CreateRiskAssessmentBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risks.create'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    if (!(await riskManagementRepository.findActiveAssessor(actor.userId)))
      throw new AppError(
        403,
        'ASSESSOR_INACTIVE',
        'The current user cannot be assigned as assessor',
      );
    if (input.assetId) {
      const asset = await riskManagementRepository.findAssetTarget(input.assetId);
      if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'The selected asset was not found');
      if (asset.deleted_at || asset.status === 'disposed')
        throw new AppError(
          422,
          'ASSET_NOT_ASSESSABLE',
          'Deleted or disposed assets cannot be assessed',
        );
    } else if (input.businessProcessId) {
      const process = await riskManagementRepository.findBusinessProcessTarget(
        input.businessProcessId,
      );
      if (!process)
        throw new AppError(
          404,
          'BUSINESS_PROCESS_NOT_FOUND',
          'The selected business process was not found',
        );
      if (process.status !== 'active')
        throw new AppError(
          422,
          'BUSINESS_PROCESS_INACTIVE',
          'The selected business process is not active',
        );
    }
    const [threatCount, vulnerabilityCount] = await Promise.all([
      riskManagementRepository.countThreats(input.threats.map(({ threatId }) => threatId)),
      riskManagementRepository.countVulnerabilities(
        input.vulnerabilities.map(({ vulnerabilityId }) => vulnerabilityId),
      ),
    ]);
    if (threatCount !== input.threats.length)
      throw new AppError(422, 'THREAT_NOT_FOUND', 'One or more selected threats do not exist');
    if (vulnerabilityCount !== input.vulnerabilities.length)
      throw new AppError(
        422,
        'VULNERABILITY_NOT_FOUND',
        'One or more selected vulnerabilities do not exist',
      );
    const score = input.likelihood * input.impact;
    const level = score <= 4 ? 'low' : score <= 9 ? 'medium' : score <= 16 ? 'high' : 'critical';
    let result: Awaited<ReturnType<typeof riskManagementRepository.create>> | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const riskCode = `RSK-${new Date().getUTCFullYear()}-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
      try {
        result = await riskManagementRepository.create(
          input,
          { riskCode, score, level },
          { actorUserId: actor.userId, ...context },
        );
        break;
      } catch (error: unknown) {
        if (!isRiskCodeConflict(error) || attempt === 2) throw error;
      }
    }
    if (!result)
      throw new AppError(
        500,
        'RISK_CODE_GENERATION_FAILED',
        'Unable to generate a unique risk code',
      );
    if (result.failure === 'ASSESSOR_INACTIVE')
      throw new AppError(
        403,
        'ASSESSOR_INACTIVE',
        'The current user cannot be assigned as assessor',
      );
    if (result.failure === 'ASSET_NOT_ASSESSABLE')
      throw new AppError(422, 'ASSET_NOT_ASSESSABLE', 'The selected asset is no longer assessable');
    if (result.failure === 'BUSINESS_PROCESS_INACTIVE')
      throw new AppError(
        422,
        'BUSINESS_PROCESS_INACTIVE',
        'The selected business process is no longer active',
      );
    if (result.duplicate)
      throw new AppError(
        409,
        'POTENTIAL_DUPLICATE_RISK',
        `An open risk with this title already exists (${result.duplicate.risk_code})`,
      );
    const risk = result.risk;
    return {
      id: risk.risk_assessment_id,
      riskCode: risk.risk_code,
      title: risk.title,
      status: risk.status,
      riskScore: risk.risk_score,
      riskLevel: risk.risk_level,
      assessedAt: risk.assessed_at,
    };
  },
  async list(query: ListRiskAssessmentsQuery, actor: { permissions: readonly string[] }) {
    if (!actor.permissions.includes('risks.read'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await riskManagementRepository.list(query);
    return {
      items: result.items.map(toRiskAssessmentListItem),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  async getById(riskAssessmentId: string, actor: { permissions: readonly string[] }) {
    if (!actor.permissions.includes('risks.read'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const risk = await riskManagementRepository.findById(riskAssessmentId);
    if (!risk)
      throw new AppError(404, 'RISK_ASSESSMENT_NOT_FOUND', 'Risk assessment was not found');
    return toRiskAssessmentDetail(risk);
  },
  async update(
    riskAssessmentId: string,
    input: UpdateRiskAssessmentBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risks.update'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const current = await riskManagementRepository.findById(riskAssessmentId);
    if (!current)
      throw new AppError(404, 'RISK_ASSESSMENT_NOT_FOUND', 'Risk assessment was not found');
    if (current.assessed_by_user_id !== actor.userId && !actor.roles.includes('ADMIN'))
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only the assessor or an administrator can edit this risk assessment',
      );
    if (!(await riskManagementRepository.findActiveAssessor(actor.userId)))
      throw new AppError(403, 'ASSESSOR_INACTIVE', 'The current user cannot edit risk assessments');
    if (!['draft', 'rejected'].includes(current.status))
      throw new AppError(
        422,
        'RISK_NOT_EDITABLE',
        'Only draft or rejected risk assessments can be edited',
      );
    if (input.assetId) {
      const asset = await riskManagementRepository.findAssetTarget(input.assetId);
      if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'The selected asset was not found');
      if (asset.deleted_at || asset.status === 'disposed')
        throw new AppError(
          422,
          'ASSET_NOT_ASSESSABLE',
          'Deleted or disposed assets cannot be assessed',
        );
    } else if (input.businessProcessId) {
      const process = await riskManagementRepository.findBusinessProcessTarget(
        input.businessProcessId,
      );
      if (!process)
        throw new AppError(
          404,
          'BUSINESS_PROCESS_NOT_FOUND',
          'The selected business process was not found',
        );
      if (process.status !== 'active')
        throw new AppError(
          422,
          'BUSINESS_PROCESS_INACTIVE',
          'The selected business process is not active',
        );
    }
    const [threatCount, vulnerabilityCount, duplicate] = await Promise.all([
      riskManagementRepository.countThreats(input.threats.map(({ threatId }) => threatId)),
      riskManagementRepository.countVulnerabilities(
        input.vulnerabilities.map(({ vulnerabilityId }) => vulnerabilityId),
      ),
      riskManagementRepository.findPotentialDuplicateForUpdate(riskAssessmentId, input),
    ]);
    if (threatCount !== input.threats.length)
      throw new AppError(422, 'THREAT_NOT_FOUND', 'One or more selected threats do not exist');
    if (vulnerabilityCount !== input.vulnerabilities.length)
      throw new AppError(
        422,
        'VULNERABILITY_NOT_FOUND',
        'One or more selected vulnerabilities do not exist',
      );
    if (duplicate)
      throw new AppError(
        409,
        'POTENTIAL_DUPLICATE_RISK',
        `An open risk with this title already exists (${duplicate.risk_code})`,
      );
    const score = input.likelihood * input.impact;
    const level = score <= 4 ? 'low' : score <= 9 ? 'medium' : score <= 16 ? 'high' : 'critical';
    const result = await riskManagementRepository.update(
      riskAssessmentId,
      input,
      { score, level },
      current,
      { actorUserId: actor.userId, ...context },
    );
    if (result.duplicate)
      throw new AppError(
        409,
        'POTENTIAL_DUPLICATE_RISK',
        `An open risk with this title already exists (${result.duplicate.risk_code})`,
      );
    if (result.failure === 'TARGET_LOCKED')
      throw new AppError(
        422,
        'RISK_TARGET_LOCKED',
        'The target of a rejected assessment cannot be changed',
      );
    if (result.failure === 'ASSESSOR_INACTIVE')
      throw new AppError(403, 'ASSESSOR_INACTIVE', 'The current user cannot edit risk assessments');
    if (result.failure === 'TARGET_INVALID')
      throw new AppError(
        422,
        'TARGET_NOT_ASSESSABLE',
        'The selected target is no longer assessable',
      );
    if (result.failure === 'THREAT_NOT_FOUND')
      throw new AppError(422, 'THREAT_NOT_FOUND', 'One or more selected threats do not exist');
    if (result.failure === 'VULNERABILITY_NOT_FOUND')
      throw new AppError(
        422,
        'VULNERABILITY_NOT_FOUND',
        'One or more selected vulnerabilities do not exist',
      );
    if (result.failure === 'RISK_HAS_TREATMENT_PLAN')
      throw new AppError(
        409,
        'RISK_HAS_TREATMENT_PLAN',
        'An assessment with a treatment plan cannot be edited',
      );
    if (result.failure === 'RISK_LINKED_TO_INCIDENT')
      throw new AppError(
        409,
        'RISK_LINKED_TO_INCIDENT',
        'An assessment linked to an incident cannot be edited',
      );
    if (result.failure === 'RISK_ASSESSMENT_CHANGED' || !result.updated)
      throw new AppError(
        409,
        'RISK_ASSESSMENT_CHANGED',
        'This risk assessment was modified by another user. Reload it before saving',
      );
    return toRiskAssessmentDetail(result.updated);
  },
} as const;
