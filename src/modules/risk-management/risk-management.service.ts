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
import type { ReturnTreatmentPlanForRevisionBody } from './dto/return-treatment-plan-for-revision.dto.js';
import type { ListTreatmentPlansQuery } from './dto/list-treatment-plans-query.dto.js';
import { toTreatmentPlanDetail, toTreatmentPlanListItem } from './risk-management.mapper.js';
import type { UpdateTreatmentActionProgressBody } from './dto/update-treatment-action-progress.dto.js';

const isRiskCodeConflict = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
    return false;
  const target = error.meta?.['target'];
  if (typeof target === 'string') return target.includes('risk_code');
  return Array.isArray(target) && target.some((column) => column === 'risk_code');
};

export const riskManagementService = {
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
  async updateTreatmentActionProgress(
    treatmentPlanId: string,
    actionId: string,
    input: UpdateTreatmentActionProgressBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risk-treatment-actions.update-progress'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    let result: Awaited<ReturnType<typeof riskManagementRepository.updateTreatmentActionProgress>>;
    try {
      result = await riskManagementRepository.updateTreatmentActionProgress(
        treatmentPlanId,
        actionId,
        input,
        { actorUserId: actor.userId, actorIsAdmin: actor.roles.includes('ADMIN'), ...context },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(
          409,
          'TREATMENT_ACTION_CHANGED',
          'This action changed. Reload and try again',
        );
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028')
        throw new AppError(
          503,
          'PROGRESS_UPDATE_TEMPORARILY_UNAVAILABLE',
          'Progress update timed out. Please try again',
        );
      throw error;
    }
    const failures = {
      ACTION_NOT_FOUND: [404, 'TREATMENT_ACTION_NOT_FOUND', 'Treatment action was not found'],
      ACTOR_INACTIVE: [403, 'ACTOR_INACTIVE', 'The current user cannot update action progress'],
      FORBIDDEN: [
        403,
        'FORBIDDEN',
        'Only the action assignee, plan owner, or administrator can update progress',
      ],
      ACTION_CHANGED: [
        409,
        'TREATMENT_ACTION_CHANGED',
        'This action changed. Reload and try again',
      ],
      ACTION_CANCELLED: [409, 'TREATMENT_ACTION_CANCELLED', 'Cancelled actions cannot be updated'],
      PLAN_NOT_TRACKABLE: [
        409,
        'TREATMENT_PLAN_NOT_TRACKABLE',
        'Only approved or in-progress plans can be tracked',
      ],
      RISK_NOT_IN_TREATMENT: [
        409,
        'RISK_NOT_IN_TREATMENT',
        'The risk is not in an approved treatment state',
      ],
      REGRESSION_NOTE_REQUIRED: [
        422,
        'PROGRESS_NOTE_REQUIRED',
        'A note is required when reducing action progress',
      ],
    } as const;
    if (result.failure) {
      const [status, code, message] = failures[result.failure];
      throw new AppError(status, code, message);
    }
    if (!result.result)
      throw new AppError(500, 'PROGRESS_UPDATE_FAILED', 'Unable to update action progress');
    return result.result;
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
        'You cannot approve a risk assessment and treatment plan that you submitted',
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
        'The submitted risk assessment or treatment plan changed and cannot be approved',
      ],
      PLAN_INVALID: [
        422,
        'TREATMENT_PLAN_NO_LONGER_VALID',
        'The risk assessment or treatment plan no longer satisfies approval requirements',
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
  async returnTreatmentPlanForRevision(
    treatmentPlanId: string,
    input: ReturnTreatmentPlanForRevisionBody,
    actor: { userId: string; permissions: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risk-treatment-plans.approve'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');

    let decision: Awaited<
      ReturnType<typeof riskManagementRepository.returnTreatmentPlanForRevision>
    >;
    try {
      decision = await riskManagementRepository.returnTreatmentPlanForRevision(
        treatmentPlanId,
        input,
        { actorUserId: actor.userId, ...context },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError(
          409,
          'APPROVAL_ALREADY_RECORDED',
          'You already made a decision for this workflow step',
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
          'The revision request timed out. Please try again',
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
      SELF_REVIEW: [
        403,
        'SELF_REVIEW_NOT_ALLOWED',
        'You cannot return a submission that you submitted',
      ],
      ACTOR_INACTIVE: [
        403,
        'APPROVER_INACTIVE',
        'The current user cannot return submissions for revision',
      ],
      WORKFLOW_INVALID: [422, 'APPROVAL_WORKFLOW_INVALID', 'The approval workflow is invalid'],
      NOT_CURRENT_APPROVER: [
        403,
        'NOT_CURRENT_APPROVER',
        'You are not an eligible approver for the current step',
      ],
      ALREADY_DECIDED: [
        409,
        'APPROVAL_ALREADY_RECORDED',
        'You already made a decision for this workflow step',
      ],
      PLAN_NOT_FOUND: [404, 'TREATMENT_PLAN_NOT_FOUND', 'Risk treatment plan was not found'],
      NOT_PENDING: [
        409,
        'SUBMISSION_NOT_PENDING_APPROVAL',
        'The risk assessment and treatment plan are no longer awaiting approval',
      ],
      SNAPSHOT_MISSING: [
        409,
        'APPROVAL_SNAPSHOT_MISSING',
        'This legacy request must be resubmitted before a revision can be requested',
      ],
      SUBMISSION_CHANGED: [
        409,
        'SUBMISSION_CHANGED_AFTER_SUBMISSION',
        'The submitted risk assessment or treatment plan changed. Reload and review it again',
      ],
    } as const;
    if (decision.failure) {
      const [status, code, message] = failures[decision.failure];
      throw new AppError(status, code, message);
    }
    if (!decision.result)
      throw new AppError(
        500,
        'REVISION_REQUEST_FAILED',
        'Unable to return the submission for revision',
      );
    return decision.result;
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
      RISK_NOT_SUBMITTABLE: [
        409,
        'RISK_ASSESSMENT_NOT_SUBMITTABLE',
        'Only draft or rejected risk assessments can be submitted with their treatment plan',
      ],
      RISK_CHANGED: [
        409,
        'RISK_ASSESSMENT_CHANGED',
        'The risk assessment changed while the plan was being submitted. Reload and try again',
      ],
      RISK_INVALID: [
        422,
        'RISK_ASSESSMENT_INVALID',
        'The risk assessment no longer has a valid target, threat, or vulnerability',
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
