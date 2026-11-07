import { readAcceptanceCost } from './dto/acceptance-cost.dto.js';
import { AppError } from '../../common/errors/app-error.js';
import { isRiskAcceptanceApprover } from '../user-management-authorization/index.js';
import { currentRiskReview } from './current-risk-review.js';
import type { CompleteRiskReview } from './dto/complete-risk-review.dto.js';
import type { ListRiskRegisterQuery } from './dto/view-risk-register.dto.js';
import { randomUUID } from 'node:crypto';
import type {
  CreateRiskAssessmentBody,
  CreateRiskOptionsQuery,
} from './dto/create-risk-assessment.dto.js';
import type { IdentifyThreatBody, UpdateThreatBody } from './dto/identify-threat.dto.js';
import type {
  IdentifyVulnerabilityBody,
  UpdateVulnerabilityBody,
  VulnerabilityControlOptionsQuery,
} from './dto/identify-vulnerability.dto.js';
import { assessmentRequiresReview, vulnerabilityBlockedReason } from './vulnerability-workflow.js';
import type { AssessInherentRiskBody } from './dto/assess-inherent-risk.dto.js';
import type { AssessResidualRiskBody } from './dto/assess-residual-risk.dto.js';
import type { DefineTargetRiskBody } from './dto/define-target-risk.dto.js';
import type {
  CreateTreatmentPlanBody,
  TreatmentPlanOptionsQuery,
} from './dto/create-treatment-plan.dto.js';
import type { UpdateTreatmentPlanBody } from './dto/update-treatment-plan.dto.js';
import type {
  DecideRiskAcceptanceBody,
  SubmitRiskAcceptanceBody,
  OpenRiskReviewBody,
} from './dto/risk-acceptance.dto.js';
import {
  riskRegisterRepository,
  type RiskRegisterDetailRecord,
  type RiskRegisterRecord,
} from './risk-register.repository.js';
import { calculateTreatmentPlanProgress } from './treatment-plan-progress.js';
import { sameResidualControlBasis, validateResidualControls } from './residual-control-basis.js';

const lower = <T extends string>(value: T): Lowercase<T> => value.toLowerCase() as Lowercase<T>;
const person = (value: { id: string; full_name: string; status: string } | null) =>
  value ? { id: value.id, fullName: value.full_name, inactive: value.status !== 'ACTIVE' } : null;
const rating = (value: string | null | undefined) => (value ? lower(value) : null);

function assessment(value: RiskRegisterRecord['risk_assessments'][number]) {
  return {
    id: value.id,
    type: lower(value.assessment_type),
    inherentLikelihood: value.inherent_likelihood,
    inherentImpact: value.inherent_impact,
    inherentRating: rating(value.inherent_rating),
    residualLikelihood: value.residual_likelihood,
    residualImpact: value.residual_impact,
    residualRating: rating(value.residual_rating),
    controlEffectiveness: value.control_effectiveness?.toNumber() ?? null,
    targetRisk: rating(value.target_risk),
    riskAppetite: rating(value.risk_appetite),
    riskTolerance: rating(value.risk_tolerance),
    reason: value.assessment_reason,
    assessedBy: person(value.users),
    assessedAt: value.assessed_at,
    reviewDate: value.review_date,
    methodologyVersion: value.methodology_version,
  };
}

function listItem(risk: RiskRegisterRecord) {
  const latestAssessment = risk.risk_assessments.find((item) => item.assessment_type !== 'TARGET_DEFINITION');
  const activeTreatmentPlan = risk.risk_treatment_plans.find((plan) =>
    ['DRAFT', 'ACTIVE'].includes(plan.status),
  );
  return {
    id: risk.id,
    riskCode: risk.risk_code,
    scope:
      risk.scope_type === 'BUSINESS_SERVICE' && risk.business_services
        ? {
            type: 'business_service' as const,
            businessService: {
              id: risk.business_services.id,
              name: risk.business_services.name,
              status: lower(risk.business_services.status),
            },
          }
        : risk.scope_type === 'ASSET'
          ? { type: 'asset' as const }
          : null,
    title: risk.title,
    description: risk.description,
    status: lower(risk.status),
    owner: person(risk.users_risks_owner_user_idTousers),
    reviewDate: risk.review_date,
    assets: risk.risk_assets.map(({ assets }) => ({
      id: assets.id,
      code: assets.asset_code,
      name: assets.name,
      status: lower(assets.status),
      criticality: assets.criticality,
    })),
    latestAssessment: latestAssessment ? assessment(latestAssessment) : null,
    linkedCounts: {
      controls: risk._count.control_risk_links,
      treatmentPlans: risk._count.risk_treatment_plans,
      incidents: risk._count.incident_risks,
    },
    activeTreatmentPlan: activeTreatmentPlan
      ? {
          id: activeTreatmentPlan.id,
          title: activeTreatmentPlan.title,
          status: lower(activeTreatmentPlan.status),
        }
      : null,
    createdAt: risk.created_at,
    updatedAt: risk.updated_at,
  };
}

async function requireSecurityOfficer(userId: string): Promise<void> {
  const actor = await riskRegisterRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
}

export const riskRegisterService = {
  async completeReview(userId: string, riskId: string, input: CompleteRiskReview) {
    try { return await riskRegisterRepository.completeReview(riskId, userId, input); }
    catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034')
        throw new AppError(409, 'RISK_REVIEW_CHANGED', 'Risk or supporting data changed concurrently. Refresh before completing.');
      throw error;
    }
  },
  async openAcceptanceReview(userId: string, riskId: string, input: OpenRiskReviewBody) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const result = await riskRegisterRepository.openAcceptanceReview(riskId, userId, input);
    if (result.kind === 'not_found') throw new AppError(404, 'RISK_NOT_FOUND', 'Risk not found');
    if (result.kind === 'not_owner') throw new AppError(403, 'RISK_OWNER_REQUIRED', 'Only the assigned Risk Owner may open a review');
    if (result.kind === 'stale') throw new AppError(409, 'RISK_CHANGED', 'Refresh the Risk before opening a review');
    if (result.kind === 'review_already_open') throw new AppError(409, 'RISK_REVIEW_ALREADY_OPEN', 'This Risk already has a review in progress. Refresh the Risk to view it.');
    if (result.kind === 'context_locked') throw new AppError(409, 'RISK_CONTEXT_LOCKED', 'Open review only for an open, under-treatment or accepted Risk without pending acceptance');
    return { riskId: result.updated.id, status: lower(result.updated.status), updatedAt: result.updated.updated_at };
  },
  async submitAcceptance(userId: string, riskId: string, input: SubmitRiskAcceptanceBody) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (new Date(`${input.validUntil}T23:59:59.999Z`) <= new Date())
      throw new AppError(422, 'INVALID_VALID_UNTIL', 'Acceptance validity must be in the future');
    const result = await riskRegisterRepository.submitAcceptance(riskId, userId, input);
    if (result.kind === 'review_in_progress')
      throw new AppError(409, 'RISK_REVIEW_IN_PROGRESS', 'Complete Risk Review before submitting a new acceptance request.');
    if (result.kind === 'control_assessments_required' || result.kind === 'control_assessments_stale')
      throw new AppError(409, 'CONTROL_REASSESSMENT_REQUIRED', 'Reassess all related applicable, implemented controls using current evidence before submitting acceptance');
    if (result.kind === 'context_locked')
      throw new AppError(
        409,
        'RISK_CONTEXT_LOCKED',
        'Accepted, closed or archived risks cannot submit acceptance directly. Review the risk first.',
      );
    if (result.kind === 'context_changed')
      throw new AppError(
        409,
        'RISK_REASSESSMENT_REQUIRED',
        'Complete an up-to-date inherent and residual assessment before submitting acceptance.',
      );
    if (result.kind === 'not_found')
      throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'not_owner')
      throw new AppError(
        403,
        'RISK_OWNER_REQUIRED',
        'Only the assigned Risk Owner may submit acceptance',
      );
    if (result.kind === 'invalid_plan')
      throw new AppError(
        422,
        'INVALID_TREATMENT_PLAN',
        'Select a treatment plan belonging to this risk',
      );
    if (result.kind === 'acceptance_cost_required') throw new AppError(422, 'ACCEPTANCE_COST_REQUIRED', 'Add cost to fix, expected loss and estimation basis to the Accept plan before submitting.');
    if (result.kind === 'invalid_plan_status')
      throw new AppError(
        422,
        'INVALID_TREATMENT_PLAN_STATUS',
        'Treatment plan status is read-only here. Refresh the risk or use Update Treatment Plan separately.',
      );
    if (result.kind === 'incomplete_actions')
      throw new AppError(
        422,
        'INCOMPLETE_TREATMENT_ACTIONS',
        'Complete or cancel every treatment action before completing the plan',
      );
    if (result.kind === 'no_completed_actions')
      throw new AppError(422, 'NO_COMPLETED_ACTIONS', 'A non-acceptance Completed plan must have at least one completed action. Review the treatment plan first.');
    if (result.kind === 'pending_exists')
      throw new AppError(
        409,
        'ACCEPTANCE_PENDING',
        'This risk already has a pending acceptance decision',
      );
    return {
      acceptanceId: result.acceptance.id,
      riskCode: result.riskCode,
      decision: lower(result.acceptance.decision),
      residualRating: lower(result.rating),
      residualScore: result.score,
      validUntil: result.acceptance.valid_until,
      requestedAt: result.acceptance.requested_at,
    };
  },
  async decideAcceptance(userId: string, acceptanceId: string, input: DecideRiskAcceptanceBody) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const result = await riskRegisterRepository.decideAcceptance(acceptanceId, userId, input);
    if (result.kind === 'control_assessments_required' || result.kind === 'control_assessments_stale')
      throw new AppError(409, 'CONTROL_REASSESSMENT_REQUIRED', 'Control evidence or assessments are no longer current. Reject the request and reassess before resubmitting.');
    if (result.kind === 'expired')
      throw new AppError(409, 'ACCEPTANCE_EXPIRED', 'The proposed acceptance period has expired. Reject this request and submit a new request with an appropriate validity date.');
    if (result.kind === 'context_changed')
      throw new AppError(
        409,
        'RISK_REASSESSMENT_REQUIRED',
        'Risk context changed after this request. Reject the outdated request and reassess before submitting a new request.',
      );
    if (result.kind === 'forbidden')
      throw new AppError(
        403,
        'AUTHORIZED_APPROVER_REQUIRED',
        'An eligible Risk Acceptance Approver is required',
      );
    if (result.kind === 'not_found')
      throw new AppError(404, 'ACCEPTANCE_NOT_FOUND', 'Risk acceptance request not found');
    if (result.kind === 'already_decided')
      throw new AppError(
        409,
        'ACCEPTANCE_ALREADY_DECIDED',
        'Risk acceptance has already been decided',
      );
    if (result.kind === 'self_approval')
      throw new AppError(
        403,
        'SELF_APPROVAL_FORBIDDEN',
        'The requester cannot approve their own acceptance',
      );
    return {
      id: result.updated.id,
      riskCode: result.riskCode,
      decision: lower(result.updated.decision),
      reason: result.updated.reason,
      decidedAt: result.updated.decided_at,
    };
  },
  async updateTreatmentPlan(userId: string, planId: string, input: UpdateTreatmentPlanBody) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const result = await riskRegisterRepository.updateTreatmentPlan(planId, userId, input);
    if (result.kind === 'pending_acceptance')
      throw new AppError(409, 'ACCEPTANCE_PENDING', 'Resolve pending acceptance before changing the treatment plan');
    if (result.kind === 'invalid_action_transition')
      throw new AppError(409, 'INVALID_ACTION_TRANSITION', 'Completed or cancelled actions are read-only; in-progress actions cannot return to pending');
    if (result.kind === 'invalid_dates')
      throw new AppError(422, 'INVALID_DUE_DATE', 'New or changed deadlines must not predate record creation. Existing overdue deadlines may be retained.');
    if (result.kind === 'no_completed_actions')
      throw new AppError(422, 'NO_COMPLETED_ACTIONS', 'A non-acceptance plan with every action cancelled must be cancelled, not completed');
    if (result.kind === 'not_found')
      throw new AppError(404, 'TREATMENT_PLAN_NOT_FOUND', 'Treatment plan not found');
    if (result.kind === 'forbidden')
      throw new AppError(
        403,
        'FORBIDDEN',
        'Security Officer or assigned Risk Owner access required',
      );
    if (result.kind === 'terminal_plan')
      throw new AppError(
        409,
        'TREATMENT_PLAN_FINALIZED',
        'Completed or cancelled treatment plans are read-only',
      );
    if (result.kind === 'terminal_risk')
      throw new AppError(
        409,
        'RISK_WORKFLOW_FINALIZED',
        'Accepted, closed or archived risks cannot change treatment plans',
      );
    if (result.kind === 'invalid_status_transition')
      throw new AppError(
        409,
        'INVALID_TREATMENT_PLAN_TRANSITION',
        'A draft plan must be activated before completion, and an active plan cannot return to draft',
      );
    if (result.kind === 'conflict')
      throw new AppError(
        409,
        'TREATMENT_PLAN_CHANGED',
        'The treatment plan changed; reload before saving',
      );
    if (result.kind === 'invalid_users')
      throw new AppError(422, 'INVALID_PLAN_OWNER', 'Plan and action owners must be active users');
    if (result.kind === 'invalid_actions')
      throw new AppError(422, 'INVALID_ACTIONS', 'Every existing action must belong to this plan');
    if (result.kind === 'invalid_controls')
      throw new AppError(
        422,
        'INVALID_CONTROLS',
        'Plan controls must already be linked to this risk',
      );
    if (result.kind === 'active_control_removal')
      throw new AppError(
        409,
        'ACTIVE_PLAN_CONTROL_REMOVAL',
        'Controls cannot be removed after a treatment plan is active',
      );
    if (result.kind === 'started_action_removed')
      throw new AppError(
        422,
        'STARTED_ACTION_REMOVAL',
        'Started or completed actions cannot be removed',
      );
    if (result.kind === 'incomplete_actions')
      throw new AppError(
        422,
        'INCOMPLETE_TREATMENT_ACTIONS',
        'Complete or cancel every treatment action before completing the plan',
      );
    return {
      id: result.updated.id,
      riskCode: result.riskCode,
      title: result.updated.title,
      strategy: lower(result.updated.strategy),
      status: lower(result.updated.status),
      riskStatus: lower(result.riskStatus),
      ownerUserId: result.updated.owner_user_id,
      targetDate: result.updated.target_completion_date,
      progress: calculateTreatmentPlanProgress(result.updated.risk_treatment_actions),
      actions: result.updated.risk_treatment_actions.map((item) => ({
        id: item.id,
        title: item.action_description,
        assignedToUserId: item.owner_user_id,
        dueDate: item.due_date,
        status: lower(item.status),
      })),
      controls: result.updated.risk_treatment_plan_controls.map(({ security_controls }) => ({
        id: security_controls.id,
        code: security_controls.control_code,
        name: security_controls.name,
      })),
      updatedAt: result.updated.updated_at,
    };
  },
  async treatmentPlanOptions(userId: string, query: TreatmentPlanOptionsQuery) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (query.riskId) {
      const scope = await riskRegisterRepository.findTreatmentPlanScope(query.riskId);
      if (!scope) throw new AppError(404, 'RISK_NOT_FOUND', 'Risk not found');
      if (actor.role !== 'SECURITY_OFFICER' && scope.owner_user_id !== userId)
        throw new AppError(403, 'FORBIDDEN', 'Security Officer or assigned Risk Owner required');
    } else if (actor.role !== 'SECURITY_OFFICER') {
      throw new AppError(403, 'FORBIDDEN', 'Select an owned Risk to load plan options');
    }
    const [users, controls] = await riskRegisterRepository.treatmentPlanOptions(
      query.riskId,
      query.q,
      query.limit,
    );
    return {
      users: users.map((item) => ({ id: item.id, fullName: item.full_name, email: item.email })),
      controls: controls.map((item) => ({
        id: item.id,
        code: item.control_code,
        name: item.name,
        implementationStatus: lower(item.implementation_status),
      })),
    };
  },
  async createTreatmentPlan(userId: string, input: CreateTreatmentPlanBody) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const today = new Date().toISOString().slice(0, 10);
    if (input.targetDate <= today || input.actions.some((item) => item.dueDate <= today))
      throw new AppError(
        422,
        'INVALID_DUE_DATE',
        'Plan and action due dates must be in the future',
      );
    const result = await riskRegisterRepository.createTreatmentPlan(userId, input);
    if (result.kind === 'context_locked')
      throw new AppError(409, 'RISK_CONTEXT_LOCKED', 'Create a plan only for an open or under-treatment Risk without pending acceptance');
    if (result.kind === 'target_exceeds_residual')
      throw new AppError(422, 'TARGET_EXCEEDS_RESIDUAL', 'Target risk cannot exceed current residual risk');
    if (result.kind === 'risk_not_found')
      throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'forbidden')
      throw new AppError(
        403,
        'FORBIDDEN',
        'Security Officer or assigned Risk Owner access required',
      );
    if (result.kind === 'active_plan_exists')
      throw new AppError(
        409,
        'ACTIVE_TREATMENT_PLAN_EXISTS',
        'This risk already has an active treatment plan',
      );
    if (result.kind === 'invalid_users')
      throw new AppError(422, 'INVALID_PLAN_OWNER', 'Plan and action owners must be active users');
    if (result.kind === 'invalid_controls')
      throw new AppError(
        422,
        'INVALID_CONTROLS',
        'All selected controls must already be linked to this risk',
      );
    return {
      id: result.plan.id,
      title: result.plan.title,
      riskCode: result.riskCode,
      strategy: lower(result.plan.strategy),
      status: lower(result.plan.status),
      targetRisk: result.targetRisk,
      targetDate: result.plan.target_completion_date,
      actionCount: result.actionCount,
      controlCount: result.controlCount,
      createdAt: result.plan.created_at,
    };
  },
  async defineTargetRisk(userId: string, riskId: string, input: DefineTargetRiskBody) {
    const foundActor = await riskRegisterRepository.findActor(userId);
    if (!foundActor || foundActor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const result = await riskRegisterRepository.defineTargetRisk(riskId, userId, input);
    if (result.kind === 'context_locked')
      throw new AppError(409, 'RISK_CONTEXT_LOCKED', 'Define target risk only for an open or under-treatment Risk without pending acceptance');
    if (result.kind === 'context_changed')
      throw new AppError(
        409,
        'RISK_REASSESSMENT_REQUIRED',
        'New vulnerabilities were recorded. Reassess inherent and residual risk before defining target risk.',
      );
    if (result.kind === 'risk_not_found')
      throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'not_owner')
      throw new AppError(
        403,
        'RISK_OWNER_REQUIRED',
        'Only the assigned Risk Owner may define target risk',
      );
    if (result.kind === 'residual_required')
      throw new AppError(422, 'RESIDUAL_ASSESSMENT_REQUIRED', 'Assess residual risk first');
    if (result.kind === 'plan_required')
      throw new AppError(
        422,
        'TREATMENT_PLAN_REQUIRED',
        'Select an active or draft treatment plan for this risk',
      );
    if (result.kind === 'target_exceeds_residual')
      throw new AppError(
        422,
        'TARGET_EXCEEDS_RESIDUAL',
        'Target risk cannot exceed current residual risk',
      );
    const rank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
    return {
      assessmentId: result.assessment.id,
      riskId: result.risk.id,
      riskCode: result.risk.risk_code,
      treatmentPlan: {
        id: result.plan.id,
        title: result.plan.title,
        strategy: lower(result.plan.strategy),
      },
      targetRisk: lower(result.target),
      residualRisk: lower(result.current.residual_rating!),
      withinAppetite: result.current.risk_appetite
        ? rank[result.target] <= rank[result.current.risk_appetite]
        : null,
      withinTolerance: result.current.risk_tolerance
        ? rank[result.target] <= rank[result.current.risk_tolerance]
        : null,
      definedAt: result.assessment.assessed_at,
    };
  },
  async assessResidualRisk(userId: string, riskId: string, input: AssessResidualRiskBody) {
    const foundActor = await riskRegisterRepository.findActor(userId);
    if (!foundActor || foundActor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const result = await riskRegisterRepository.assessResidualRisk(riskId, userId, input);
    if (result.kind === 'context_locked')
      throw new AppError(409, 'RISK_CONTEXT_LOCKED', 'Assess residual risk only for an open or under-treatment risk without a pending acceptance');
    if (result.kind === 'thresholds_changed')
      throw new AppError(409, 'RISK_THRESHOLDS_CHANGED', 'Use the appetite and tolerance already recorded for this Risk');
    if (result.kind === 'control_assessments_stale')
      throw new AppError(409, 'CONTROL_REASSESSMENT_REQUIRED', 'Reassess applicable, implemented controls after their latest changes');
    if (result.kind === 'context_changed')
      throw new AppError(
        409,
        'RISK_REASSESSMENT_REQUIRED',
        'New vulnerabilities were recorded. Reassess inherent risk before assessing residual risk.',
      );
    if (result.kind === 'risk_not_found')
      throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'not_owner')
      throw new AppError(
        403,
        'RISK_OWNER_REQUIRED',
        'Only the assigned Risk Owner may assess residual risk',
      );
    if (result.kind === 'inherent_required')
      throw new AppError(422, 'INHERENT_ASSESSMENT_REQUIRED', 'Assess inherent risk first');
    if (result.kind === 'control_assessments_required')
      throw new AppError(
        422,
        'CONTROL_ASSESSMENTS_REQUIRED',
        'Every related control requires an effectiveness assessment',
      );
    const rank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
    const rating = result.rating as keyof typeof rank;
    const appetite = input.riskAppetite.toUpperCase() as keyof typeof rank;
    const tolerance = input.riskTolerance.toUpperCase() as keyof typeof rank;
    return {
      assessmentId: result.assessment.id,
      riskId: result.risk.id,
      riskCode: result.risk.risk_code,
      likelihood: input.likelihood,
      impact: input.impact,
      score: result.score,
      rating: lower(result.rating),
      controlEffectiveness: Number(result.controlEffectiveness.toFixed(2)),
      withinAppetite: rank[rating] <= rank[appetite],
      withinTolerance: rank[rating] <= rank[tolerance],
      assessedAt: result.assessment.assessed_at,
    };
  },
  async assessInherentRisk(userId: string, riskId: string, input: AssessInherentRiskBody) {
    await requireSecurityOfficer(userId);
    const result = await riskRegisterRepository.assessInherentRisk(riskId, userId, input);
    if (result.kind === 'risk_not_found')
      throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'context_locked')
      throw new AppError(
        409,
        'RISK_CONTEXT_LOCKED',
        'Only open or under-treatment risks can receive an inherent-risk assessment',
      );
    if (result.kind === 'major_change_reason_required')
      throw new AppError(
        422,
        'MAJOR_RISK_CHANGE_REASON_REQUIRED',
        'Explain a rating reduction of two or more levels in at least 30 characters',
      );
    if (result.kind === 'major_change_reason_unchanged')
      throw new AppError(
        422,
        'MAJOR_RISK_CHANGE_REASON_UNCHANGED',
        'A major rating reduction requires a new explanation, not the previous assessment basis',
      );
    if (result.kind === 'incomplete_context')
      throw new AppError(
        422,
        'INHERENT_CONTEXT_INCOMPLETE',
        'The risk requires an asset, threat, and vulnerability before inherent assessment',
      );
    return {
      assessmentId: result.assessment.id,
      assessmentType: lower(result.assessment.assessment_type),
      methodologyVersion: result.assessment.methodology_version,
      riskId: result.risk.id,
      riskCode: result.risk.risk_code,
      title: result.risk.title,
      likelihood: input.likelihood,
      impact: input.impact,
      score: result.score,
      rating: lower(result.rating),
      assessedAt: result.assessment.assessed_at,
    };
  },
  async identifyVulnerability(userId: string, riskId: string, input: IdentifyVulnerabilityBody) {
    await requireSecurityOfficer(userId);
    const result = await riskRegisterRepository.identifyVulnerability(riskId, userId, input);
    if (result.kind === 'context_locked')
      throw new AppError(409, 'RISK_CONTEXT_LOCKED', result.blockedReason);
    if (result.kind === 'risk_not_found')
      throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'duplicate')
      throw new AppError(
        409,
        'VULNERABILITY_ALREADY_EXISTS',
        'A vulnerability with this name already exists for the risk',
      );
    if (result.kind === 'invalid_controls')
      throw new AppError(
        422,
        'INVALID_CONTROL_LINKS',
        'Selected controls must be applicable or under review',
      );
    return {
      id: result.vulnerability.id,
      name: result.vulnerability.name,
      description: result.vulnerability.description,
      controls: result.vulnerability.risk_vulnerability_controls.map(({ security_controls }) => ({
        id: security_controls.id,
        code: security_controls.control_code,
        name: security_controls.name,
      })),
      createdAt: result.vulnerability.created_at,
      updatedAt: result.vulnerability.updated_at,
    };
  },
  async updateVulnerability(
    userId: string,
    riskId: string,
    vulnerabilityId: string,
    input: UpdateVulnerabilityBody,
  ) {
    await requireSecurityOfficer(userId);
    const result = await riskRegisterRepository.updateVulnerability(
      riskId,
      vulnerabilityId,
      userId,
      input,
    );
    if (result.kind === 'risk_not_found')
      throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'vulnerability_not_found')
      throw new AppError(404, 'VULNERABILITY_NOT_FOUND', 'Vulnerability record not found');
    if (result.kind === 'context_locked')
      throw new AppError(409, 'RISK_CONTEXT_LOCKED', result.blockedReason);
    if (result.kind === 'stale')
      throw new AppError(
        409,
        'VULNERABILITY_CHANGED',
        'This vulnerability changed after the form was opened. Refresh and try again.',
      );
    if (result.kind === 'duplicate')
      throw new AppError(
        409,
        'VULNERABILITY_ALREADY_EXISTS',
        'A vulnerability with this name already exists for the risk',
      );
    if (result.kind === 'invalid_controls')
      throw new AppError(
        422,
        'INVALID_CONTROL_LINKS',
        'Selected controls must be applicable or under review',
      );
    return {
      id: result.vulnerability.id,
      name: result.vulnerability.name,
      description: result.vulnerability.description,
      controls: result.vulnerability.risk_vulnerability_controls.map(({ security_controls }) => ({
        id: security_controls.id,
        code: security_controls.control_code,
        name: security_controls.name,
      })),
      createdAt: result.vulnerability.created_at,
      updatedAt: result.vulnerability.updated_at,
      assessmentReviewRequired: true,
    };
  },
  async vulnerabilityControlOptions(
    userId: string,
    riskId: string,
    query: VulnerabilityControlOptionsQuery,
  ) {
    await requireSecurityOfficer(userId);
    const controls = await riskRegisterRepository.vulnerabilityControlOptions(
      riskId,
      query.q,
      query.limit,
    );
    return controls.map((item) => ({
      id: item.id,
      code: item.control_code,
      name: item.name,
      applicability: lower(item.applicability),
      implementationStatus: lower(item.implementation_status),
      linkedToRisk: item.control_risk_links.length > 0,
    }));
  },
  async identifyThreat(userId: string, riskId: string, input: IdentifyThreatBody) {
    await requireSecurityOfficer(userId);
    const result = await riskRegisterRepository.identifyThreat(riskId, userId, input);
    if (result.kind === 'context_locked')
      throw new AppError(409, 'RISK_CONTEXT_LOCKED', result.blockedReason);
    if (result.kind === 'risk_not_found')
      throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'duplicate')
      throw new AppError(
        409,
        'THREAT_ALREADY_EXISTS',
        'A threat with this name already exists for the risk',
      );
    if (result.kind === 'invalid_vulnerabilities')
      throw new AppError(
        422,
        'INVALID_VULNERABILITY_LINKS',
        'All selected vulnerabilities must belong to the risk',
      );
    return {
      id: result.threat.id,
      name: result.threat.name,
      description: result.threat.description,
      vulnerabilities: result.threat.risk_threat_vulnerabilities.map(
        ({ risk_vulnerabilities }) => risk_vulnerabilities,
      ),
      createdAt: result.threat.created_at,
      updatedAt: result.threat.updated_at,
    };
  },
  async updateThreat(userId: string, riskId: string, threatId: string, input: UpdateThreatBody) {
    await requireSecurityOfficer(userId);
    const result = await riskRegisterRepository.updateThreat(riskId, threatId, userId, input);
    if (result.kind === 'risk_not_found')
      throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'threat_not_found')
      throw new AppError(404, 'THREAT_NOT_FOUND', 'Threat record not found');
    if (result.kind === 'context_locked')
      throw new AppError(409, 'RISK_CONTEXT_LOCKED', result.blockedReason);
    if (result.kind === 'stale')
      throw new AppError(
        409,
        'THREAT_CHANGED',
        'This threat changed after the form was opened. Refresh and try again.',
      );
    if (result.kind === 'duplicate')
      throw new AppError(
        409,
        'THREAT_ALREADY_EXISTS',
        'A threat with this name already exists for the risk',
      );
    if (result.kind === 'invalid_vulnerabilities')
      throw new AppError(
        422,
        'INVALID_VULNERABILITY_LINKS',
        'All selected vulnerabilities must belong to the risk',
      );
    return {
      id: result.threat.id,
      name: result.threat.name,
      description: result.threat.description,
      vulnerabilities: result.threat.risk_threat_vulnerabilities.map(
        ({ risk_vulnerabilities }) => risk_vulnerabilities,
      ),
      createdAt: result.threat.created_at,
      updatedAt: result.threat.updated_at,
      assessmentReviewRequired: true,
    };
  },
  async createOptions(userId: string, query: CreateRiskOptionsQuery) {
    await requireSecurityOfficer(userId);
    const [assets, businessServices, owners] =
      await riskRegisterRepository.listCreateOptions(query);
    return {
      assets: assets.map((item) => ({
        id: item.id,
        code: item.asset_code,
        name: item.name,
        criticality: item.criticality,
      })),
      businessServices: businessServices.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        assetCount: item._count.assets,
      })),
      owners: owners.map((item) => ({
        id: item.id,
        fullName: item.full_name,
        email: item.email,
        role: lower(item.role),
      })),
    };
  },
  async create(userId: string, input: CreateRiskAssessmentBody) {
    await requireSecurityOfficer(userId);
    if (new Date(`${input.reviewDate}T23:59:59.999Z`) <= new Date())
      throw new AppError(422, 'INVALID_REVIEW_DATE', 'Review date must be in the future');
    const [owner, scopeAssets] = await Promise.all([
      riskRegisterRepository.findOwner(input.ownerUserId),
      riskRegisterRepository.findScopeAssets(input.scope),
    ]);
    if (!owner)
      throw new AppError(422, 'INVALID_RISK_OWNER', 'Risk owner must be an active Employee');
    if (scopeAssets.length === 0)
      throw new AppError(
        422,
        'INVALID_ASSESSMENT_SCOPE',
        'The selected scope has no active assets',
      );
    const riskCode = `RSK-${randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await riskRegisterRepository.create(
      userId,
      input,
      scopeAssets.map(({ id }) => id),
      riskCode,
    );
    return {
      id: created.id,
      riskCode: created.risk_code,
      title: created.title,
      status: lower(created.status),
      createdAt: created.created_at,
    };
  },
  async list(userId: string, query: ListRiskRegisterQuery) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const employeeApprover = actor.role === 'EMPLOYEE' && isRiskAcceptanceApprover(actor);
    const scopedQuery = ['SECURITY_OFFICER', 'EXECUTIVE'].includes(actor.role) || employeeApprover
      ? query
      : { ...query, ownerId: userId };
    const [total, records] = await riskRegisterRepository.list(scopedQuery, employeeApprover ? userId : undefined);
    const reviewEvents = records.length ? await riskRegisterRepository.findReviewEvents(records.map((item) => item.id)) : [];
    return {
      items: records.map((item) => ({ ...listItem(item),
        canAssessResidual: actor.role === 'EMPLOYEE' && item.users_risks_owner_user_idTousers?.id === userId,
        canDefineTarget: actor.role === 'EMPLOYEE' && item.users_risks_owner_user_idTousers?.id === userId,
        canManageTreatmentPlan: !['ACCEPTED', 'CLOSED', 'ARCHIVED'].includes(item.status) && (actor.role === 'SECURITY_OFFICER' || (actor.role === 'EMPLOYEE' && item.users_risks_owner_user_idTousers?.id === userId)),
        reviewInProgress:
        ['OPEN', 'UNDER_TREATMENT'].includes(item.status) && Boolean(currentRiskReview(reviewEvents.filter((event) => event.resource_id === item.id))),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  async get(userId: string, riskId: string) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const [found, contextHistory] = await Promise.all([
      riskRegisterRepository.findById(riskId),
      riskRegisterRepository.findContextHistory(riskId),
    ]);
    if (!found) throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (
      !['SECURITY_OFFICER', 'EXECUTIVE'].includes(actor.role) &&
      found.users_risks_owner_user_idTousers?.id !== userId &&
      !(isRiskAcceptanceApprover(actor) && found.risk_acceptances.some((item) => item.decision === 'PENDING' && item.requested_by !== userId))
    )
      throw new AppError(403, 'FORBIDDEN', 'Risk Owner or Security Officer access required');
    const risk: RiskRegisterDetailRecord = found;
    const targetHistory = await riskRegisterRepository.findTargetHistory(riskId);
    const acceptanceAudits = await riskRegisterRepository.findAcceptanceAudits(riskId);
    const currentReview = ['OPEN', 'UNDER_TREATMENT'].includes(risk.status) ? currentRiskReview(acceptanceAudits) : null;
    const acceptanceDecisionReasons = new Map<string, string>();
    const acceptanceRequestReasons = new Map<string, string>();
    const acceptanceCostSnapshots = new Map<string, unknown>();
    const acceptanceBases = new Map<string, { assessmentId: string; treatmentPlanId: string; planUpdatedAt: string; controlBasis: unknown }>();
    let reviewOpenedAt: Date | null = null;
    for (const entry of acceptanceAudits) {
      if (entry.action === 'RISK_REVIEW_OPENED' && !reviewOpenedAt) reviewOpenedAt = entry.occurred_at;
      const data = entry.after_data;
      if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.acceptanceId !== 'string') continue;
      if (entry.action === 'RISK_ACCEPTANCE_DECIDED' && typeof data.decisionReason === 'string' && !acceptanceDecisionReasons.has(data.acceptanceId))
        acceptanceDecisionReasons.set(data.acceptanceId, data.decisionReason);
      if (entry.action === 'RISK_ACCEPTANCE_SUBMITTED' && typeof data.acceptanceReason === 'string' && !acceptanceRequestReasons.has(data.acceptanceId))
        acceptanceRequestReasons.set(data.acceptanceId, data.acceptanceReason);
      if (entry.action === 'RISK_ACCEPTANCE_SUBMITTED' && typeof data.acceptanceId === 'string' && !acceptanceCostSnapshots.has(data.acceptanceId)) acceptanceCostSnapshots.set(data.acceptanceId, data.acceptanceCost);
      if (entry.action === 'RISK_ACCEPTANCE_SUBMITTED' && typeof data.assessmentId === 'string' && typeof data.treatmentPlanId === 'string' && typeof data.planUpdatedAt === 'string' && !acceptanceBases.has(data.acceptanceId))
        acceptanceBases.set(data.acceptanceId, { assessmentId: data.assessmentId, treatmentPlanId: data.treatmentPlanId, planUpdatedAt: data.planUpdatedAt, controlBasis: data.controlBasis });
    }
    const pendingAcceptance = risk.risk_acceptances.some((item) => item.decision === 'PENDING');
    const currentResidual = risk.risk_assessments.find((item) => item.assessment_type !== 'TARGET_DEFINITION');
    let acceptanceBlockedReason = !['OPEN', 'UNDER_TREATMENT'].includes(risk.status)
      ? 'Review the accepted Risk first; closed or archived Risks cannot submit acceptance.'
      : pendingAcceptance ? 'Resolve the pending acceptance request first.'
      : currentReview ? 'Complete Risk Review before submitting a new acceptance request.'
      : !currentResidual?.residual_rating ? 'Assess residual risk before submitting acceptance.'
      : assessmentRequiresReview(currentResidual.assessed_at, [...risk.risk_vulnerabilities, ...risk.risk_threats])
        ? 'Threat or Vulnerability context changed. Reassess inherent and residual risk.'
        : !risk.risk_treatment_plans.some((plan) => ['DRAFT', 'ACTIVE', 'COMPLETED'].includes(plan.status) && (plan.strategy !== 'ACCEPT' || readAcceptanceCost(plan.acceptance_cost_basis)))
          ? 'Create an eligible treatment plan; Accept plans require cost to fix, expected loss and estimation basis.' : null;
    if (!acceptanceBlockedReason && reviewOpenedAt && currentResidual && currentResidual.assessed_at <= reviewOpenedAt)
      acceptanceBlockedReason = 'Assess residual risk again after opening this review.';
    const controlLinks = pendingAcceptance || (!acceptanceBlockedReason && risk.users_risks_owner_user_idTousers?.id === userId)
      ? await riskRegisterRepository.getAcceptanceControlLinks(riskId) : null;
    const controlBlock = controlLinks ? validateResidualControls(controlLinks) : null;
    if (!acceptanceBlockedReason && controlBlock) acceptanceBlockedReason = 'Reassess all related applicable, implemented Controls using current Evidence.';
    const blockedReason = vulnerabilityBlockedReason(
      risk.status,
      risk.risk_acceptances.some((item) => item.decision === 'PENDING'),
    );
    const inherent = risk.risk_assessments.find((item) =>
      item.assessment_type !== 'TARGET_DEFINITION' && item.inherent_rating !== null && item.residual_rating === null);
    const assetContextChange = inherent && risk.risk_assets.length
      ? await riskRegisterRepository.findAssetContextChange(risk.risk_assets.map(({ assets }) => assets.id), inherent.assessed_at)
      : null;
    return {
      ...listItem(risk),
      currentReview,
      canCompleteReview: Boolean(currentReview && risk.users_risks_owner_user_idTousers?.id === userId && !pendingAcceptance),
      reviewHistory: acceptanceAudits.filter((entry) => entry.action === 'RISK_REVIEW_COMPLETED').flatMap((entry) => {
        const data = entry.after_data;
        if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.conclusion !== 'string' ||
            typeof data.nextReviewDate !== 'string' || typeof data.residualRating !== 'string') return [];
        const text = (key: string) => typeof data[key] === 'string' ? data[key] : null;
        return [{ completedAt: entry.occurred_at, completedByName: text('completedByName'), conclusion: data.conclusion,
          nextReviewDate: data.nextReviewDate, residualRating: data.residualRating, openedAt: text('openedAt'),
          openedByName: text('openedByName'), previousReviewDate: text('previousReviewDate'), openingReason: text('openingReason') }];
      }),
      assetContextReviewRequired: Boolean(assetContextChange),
      assetClassificationReviewRequired: Boolean(inherent && risk.risk_assets.some(({ assets }) =>
        assets.classified_at && assets.classified_at > inherent.assessed_at)),
      acceptanceWorkflow: {
        canSubmit: risk.users_risks_owner_user_idTousers?.id === userId && !acceptanceBlockedReason,
        blockedReason: risk.users_risks_owner_user_idTousers?.id === userId ? acceptanceBlockedReason : 'Only the assigned Risk Owner may submit acceptance.',
        canOpenReview: risk.users_risks_owner_user_idTousers?.id === userId && ['OPEN', 'UNDER_TREATMENT', 'ACCEPTED'].includes(risk.status) && !pendingAcceptance && !currentReview,
      },
      targetHistory: targetHistory.flatMap((entry) => {
        const data = entry.after_data;
        if (!data || typeof data !== 'object' || Array.isArray(data) ||
          typeof data.assessmentId !== 'string') return [];
        const stringValue = (key: string) => typeof data[key] === 'string' ? data[key] : null;
        return [{
          assessmentId: data.assessmentId,
          treatmentPlanId: stringValue('treatmentPlanId'),
          treatmentPlanTitle: stringValue('treatmentPlanTitle'),
          residualAssessmentId: stringValue('residualAssessmentId'),
          residualAssessedAt: stringValue('residualAssessedAt'),
          residualRating: stringValue('residualRating')?.toLowerCase() ?? null,
        }];
      }),
      vulnerabilityWorkflow: {
        canIdentify: actor.role === 'SECURITY_OFFICER' && !blockedReason,
        blockedReason:
          actor.role === 'SECURITY_OFFICER' ? blockedReason : 'Security Officer role required.',
        assessmentReviewRequired: assessmentRequiresReview(risk.risk_assessments.find((item) => item.assessment_type !== 'TARGET_DEFINITION')?.assessed_at, [
          ...risk.risk_vulnerabilities,
          ...risk.risk_threats,
        ]),
      },
      createdBy: person(risk.users_risks_created_byTousers),
      contextHistory: contextHistory.map((item) => ({
        id: item.id,
        type: item.action.startsWith('RISK_THREAT_') ? 'threat' : 'vulnerability',
        event: item.action.endsWith('_CREATED') ? 'created' : 'updated',
        entityId:
          typeof item.after_data === 'object' &&
          item.after_data &&
          'id' in item.after_data &&
          typeof item.after_data.id === 'string'
            ? item.after_data.id
            : null,
        occurredAt: item.occurred_at,
        actor: item.users
          ? { id: item.users.id, fullName: item.users.full_name, email: item.users.email }
          : null,
        before: item.before_data,
        after: item.after_data,
      })),
      assessments: risk.risk_assessments.map(assessment),
      threats: risk.risk_threats.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        vulnerabilities: item.risk_threat_vulnerabilities.map(
          ({ risk_vulnerabilities }) => risk_vulnerabilities,
        ),
      })),
      vulnerabilities: risk.risk_vulnerabilities.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        controls: item.risk_vulnerability_controls.map(({ security_controls }) => ({
          id: security_controls.id,
          code: security_controls.control_code,
          name: security_controls.name,
        })),
      })),
      controls: risk.control_risk_links.map(({ security_controls: item }) => ({
        id: item.id,
        code: item.control_code,
        name: item.name,
        applicability: lower(item.applicability),
        implementationStatus: lower(item.implementation_status),
        latestEffectiveness: item.control_assessments[0]?.effectiveness?.toNumber() ?? null,
        latestResult: item.control_assessments[0]?.result?.toLowerCase() ?? null,
      })),
      treatmentPlans: risk.risk_treatment_plans.map((item) => ({
        id: item.id,
        riskId: risk.id,
        title: item.title,
        strategy: lower(item.strategy),
        status: lower(item.status),
        owner: person(item.users_risk_treatment_plans_owner_user_idTousers),
        targetCompletionDate: item.target_completion_date,
        acceptanceCost: readAcceptanceCost(item.acceptance_cost_basis),
        actionCount: item._count.risk_treatment_actions,
        progress: calculateTreatmentPlanProgress(item.risk_treatment_actions),
        updatedAt: item.updated_at,
        controls: item.risk_treatment_plan_controls.map(({ security_controls }) => ({
          id: security_controls.id,
          code: security_controls.control_code,
          name: security_controls.name,
        })),
        actions: item.risk_treatment_actions.map((action) => ({
          id: action.id,
          title: action.action_description,
          assignedToUserId: action.owner_user_id,
          status: lower(action.status),
          dueDate: action.due_date,
        })),
      })),
      incidents: risk.incident_risks.map(({ incidents: item }) => ({
        id: item.id,
        code: item.incident_code,
        title: item.title,
        severity: item.severity,
        status: lower(item.status),
        createdAt: item.created_at,
      })),
      acceptances: risk.risk_acceptances.map((item) => {
        const expired = Boolean(item.valid_until && item.valid_until.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10));
        const basis = acceptanceBases.get(item.id);
        const plan = risk.risk_treatment_plans.find((entry) => entry.id === basis?.treatmentPlanId);
        const approvalBlockedReason = plan?.strategy === 'ACCEPT' && !readAcceptanceCost(plan.acceptance_cost_basis) ? 'The Accept plan has no valid cost justification. Reject and resubmit after updating the plan.' : expired ? 'The proposed acceptance period has expired. Reject and resubmit.'
          : !['OPEN', 'UNDER_TREATMENT'].includes(risk.status) || risk.users_risks_owner_user_idTousers?.id !== item.requested_by || assessmentRequiresReview(item.requested_at, [...risk.risk_vulnerabilities, ...risk.risk_threats])
            ? 'Risk context or Owner changed. Reject and reassess.'
            : controlBlock ? 'Control assessments or Evidence are no longer current. Reject and reassess.'
            : !basis || !controlLinks || !sameResidualControlBasis(basis.controlBasis, controlLinks) || currentResidual?.id !== basis.assessmentId || !plan || !['DRAFT', 'ACTIVE', 'COMPLETED'].includes(plan.status) || plan.updated_at.toISOString() !== basis.planUpdatedAt
              ? 'The submitted assessment/plan basis is missing or changed. Reject and resubmit.' : null;
        return {
        id: item.id,
        decision: lower(item.decision),
        reason: item.reason,
        requestReason: acceptanceRequestReasons.get(item.id) ?? (item.decision === 'PENDING' ? item.reason : null),
        decisionReason: acceptanceDecisionReasons.get(item.id) ?? null,
        expired,
        historical: Boolean(reviewOpenedAt && item.decision === 'APPROVED' && item.decided_at && item.decided_at <= reviewOpenedAt),
        approvalBlockedReason: item.decision === 'PENDING' ? approvalBlockedReason : null,
        acceptanceCost: readAcceptanceCost(acceptanceCostSnapshots.get(item.id)),
        canDecide: item.decision === 'PENDING' && item.requested_by !== userId && risk.users_risks_owner_user_idTousers?.id !== userId && isRiskAcceptanceApprover(actor),
        requestedAt: item.requested_at,
        validUntil: item.valid_until,
        requestedBy: item.requested_by,
        decidedBy: item.decided_by,
        decidedAt: item.decided_at,
      }; }),
    };
  },
};
