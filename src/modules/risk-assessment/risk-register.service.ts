import { AppError } from '../../common/errors/app-error.js';
import type { ListRiskRegisterQuery } from './dto/view-risk-register.dto.js';
import { randomUUID } from 'node:crypto';
import type {
  CreateRiskAssessmentBody,
  CreateRiskOptionsQuery,
} from './dto/create-risk-assessment.dto.js';
import type { IdentifyThreatBody } from './dto/identify-threat.dto.js';
import type { IdentifyVulnerabilityBody } from './dto/identify-vulnerability.dto.js';
import type { AssessInherentRiskBody } from './dto/assess-inherent-risk.dto.js';
import type { AssessResidualRiskBody } from './dto/assess-residual-risk.dto.js';
import type { DefineTargetRiskBody } from './dto/define-target-risk.dto.js';
import type { CreateTreatmentPlanBody, TreatmentPlanOptionsQuery } from './dto/create-treatment-plan.dto.js';
import type { UpdateTreatmentPlanBody } from './dto/update-treatment-plan.dto.js';
import type { DecideRiskAcceptanceBody, SubmitRiskAcceptanceBody } from './dto/risk-acceptance.dto.js';
import {
  riskRegisterRepository,
  type RiskRegisterDetailRecord,
  type RiskRegisterRecord,
} from './risk-register.repository.js';
import { calculateTreatmentPlanProgress } from './treatment-plan-progress.js';

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
  };
}

function listItem(risk: RiskRegisterRecord) {
  const activeTreatmentPlan = risk.risk_treatment_plans.find((plan) =>
    ['DRAFT', 'ACTIVE'].includes(plan.status),
  );
  return {
    id: risk.id,
    riskCode: risk.risk_code,
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
    latestAssessment: risk.risk_assessments[0] ? assessment(risk.risk_assessments[0]) : null,
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
  async submitAcceptance(userId: string, riskId: string, input: SubmitRiskAcceptanceBody) {
    const actor = await riskRegisterRepository.findActor(userId); if (!actor || actor.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (new Date(`${input.validUntil}T23:59:59.999Z`) <= new Date()) throw new AppError(422, 'INVALID_VALID_UNTIL', 'Acceptance validity must be in the future');
    const result = await riskRegisterRepository.submitAcceptance(riskId, userId, input);
    if (result.kind === 'not_found') throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'not_owner') throw new AppError(403, 'RISK_OWNER_REQUIRED', 'Only the assigned Risk Owner may submit acceptance');
    if (result.kind === 'invalid_plan') throw new AppError(422, 'INVALID_TREATMENT_PLAN', 'Select a treatment plan belonging to this risk');
    if (result.kind === 'invalid_plan_status') throw new AppError(422, 'INVALID_TREATMENT_PLAN_STATUS', 'A completed treatment plan cannot be reopened');
    if (result.kind === 'incomplete_actions') throw new AppError(422, 'INCOMPLETE_TREATMENT_ACTIONS', 'Complete or cancel every treatment action before completing the plan');
    if (result.kind === 'pending_exists') throw new AppError(409, 'ACCEPTANCE_PENDING', 'This risk already has a pending acceptance decision');
    return { acceptanceId: result.acceptance.id, riskCode: result.riskCode, decision: lower(result.acceptance.decision), residualRating: lower(result.rating), residualScore: result.score, validUntil: result.acceptance.valid_until, requestedAt: result.acceptance.requested_at };
  },
  async decideAcceptance(userId: string, acceptanceId: string, input: DecideRiskAcceptanceBody) {
    const actor = await riskRegisterRepository.findActor(userId); if (!actor || actor.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const result = await riskRegisterRepository.decideAcceptance(acceptanceId, userId, input);
    if (result.kind === 'forbidden') throw new AppError(403, 'AUTHORIZED_APPROVER_REQUIRED', 'Security Officer or Executive approver required');
    if (result.kind === 'not_found') throw new AppError(404, 'ACCEPTANCE_NOT_FOUND', 'Risk acceptance request not found');
    if (result.kind === 'already_decided') throw new AppError(409, 'ACCEPTANCE_ALREADY_DECIDED', 'Risk acceptance has already been decided');
    if (result.kind === 'self_approval') throw new AppError(403, 'SELF_APPROVAL_FORBIDDEN', 'The requester cannot approve their own acceptance');
    return { id: result.updated.id, riskCode: result.riskCode, decision: lower(result.updated.decision), reason: result.updated.reason, decidedAt: result.updated.decided_at };
  },
  async updateTreatmentPlan(userId: string, planId: string, input: UpdateTreatmentPlanBody) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const today = new Date().toISOString().slice(0, 10);
    if (input.targetDate <= today || input.actions.some((item) => item.dueDate <= today && item.status !== 'completed')) throw new AppError(422, 'INVALID_DUE_DATE', 'Open action and plan due dates must be in the future');
    const result = await riskRegisterRepository.updateTreatmentPlan(planId, userId, input);
    if (result.kind === 'not_found') throw new AppError(404, 'TREATMENT_PLAN_NOT_FOUND', 'Treatment plan not found');
    if (result.kind === 'forbidden') throw new AppError(403, 'FORBIDDEN', 'Security Officer or assigned Risk Owner access required');
    if (result.kind === 'terminal_plan') throw new AppError(409, 'TREATMENT_PLAN_FINALIZED', 'Completed or cancelled treatment plans are read-only');
    if (result.kind === 'conflict') throw new AppError(409, 'TREATMENT_PLAN_CHANGED', 'The treatment plan changed; reload before saving');
    if (result.kind === 'invalid_users') throw new AppError(422, 'INVALID_PLAN_OWNER', 'Plan and action owners must be active users');
    if (result.kind === 'invalid_actions') throw new AppError(422, 'INVALID_ACTIONS', 'Every existing action must belong to this plan');
    if (result.kind === 'started_action_removed') throw new AppError(422, 'STARTED_ACTION_REMOVAL', 'Started or completed actions cannot be removed');
    if (result.kind === 'incomplete_actions') throw new AppError(422, 'INCOMPLETE_TREATMENT_ACTIONS', 'Complete or cancel every treatment action before completing the plan');
    return { id: result.updated.id, riskCode: result.riskCode, title: result.updated.title, strategy: lower(result.updated.strategy), status: lower(result.updated.status), ownerUserId: result.updated.owner_user_id, targetDate: result.updated.target_completion_date, progress: calculateTreatmentPlanProgress(result.updated.risk_treatment_actions), actions: result.updated.risk_treatment_actions.map((item) => ({ id: item.id, title: item.action_description, assignedToUserId: item.owner_user_id, dueDate: item.due_date, status: lower(item.status) })), updatedAt: result.updated.updated_at };
  },
  async treatmentPlanOptions(userId: string, query: TreatmentPlanOptionsQuery) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const [users, controls] = await riskRegisterRepository.treatmentPlanOptions(query.q, query.limit);
    return {
      users: users.map((item) => ({ id: item.id, fullName: item.full_name, email: item.email })),
      controls: controls.map((item) => ({ id: item.id, code: item.control_code, name: item.name, implementationStatus: lower(item.implementation_status) })),
    };
  },
  async createTreatmentPlan(userId: string, input: CreateTreatmentPlanBody) {
    const actor = await riskRegisterRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const today = new Date().toISOString().slice(0, 10);
    if (input.targetDate <= today || input.actions.some((item) => item.dueDate <= today))
      throw new AppError(422, 'INVALID_DUE_DATE', 'Plan and action due dates must be in the future');
    const result = await riskRegisterRepository.createTreatmentPlan(userId, input);
    if (result.kind === 'risk_not_found') throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (result.kind === 'forbidden') throw new AppError(403, 'FORBIDDEN', 'Security Officer or assigned Risk Owner access required');
    if (result.kind === 'active_plan_exists') throw new AppError(409, 'ACTIVE_TREATMENT_PLAN_EXISTS', 'This risk already has an active treatment plan');
    if (result.kind === 'invalid_users') throw new AppError(422, 'INVALID_PLAN_OWNER', 'Plan and action owners must be active users');
    if (result.kind === 'invalid_controls') throw new AppError(422, 'INVALID_CONTROLS', 'All selected controls must exist');
    return { id: result.plan.id, title: result.plan.title, riskCode: result.riskCode, strategy: lower(result.plan.strategy), status: lower(result.plan.status), targetRisk: result.targetRisk, targetDate: result.plan.target_completion_date, actionCount: result.actionCount, controlCount: result.controlCount, createdAt: result.plan.created_at };
  },
  async defineTargetRisk(userId: string, riskId: string, input: DefineTargetRiskBody) {
    const foundActor = await riskRegisterRepository.findActor(userId);
    if (!foundActor || foundActor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const result = await riskRegisterRepository.defineTargetRisk(riskId, userId, input);
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
    if (result.kind === 'incomplete_context')
      throw new AppError(
        422,
        'INHERENT_CONTEXT_INCOMPLETE',
        'The risk requires an asset, threat, and vulnerability before inherent assessment',
      );
    return {
      assessmentId: result.assessment.id,
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
    const result = await riskRegisterRepository.identifyVulnerability(riskId, input);
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
        'All selected security controls must be linked to the risk',
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
    };
  },
  async identifyThreat(userId: string, riskId: string, input: IdentifyThreatBody) {
    await requireSecurityOfficer(userId);
    const result = await riskRegisterRepository.identifyThreat(riskId, input);
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
    const scopedQuery = ['SECURITY_OFFICER', 'EXECUTIVE'].includes(actor.role) ? query : { ...query, ownerId: userId };
    const [total, records] = await riskRegisterRepository.list(scopedQuery);
    return {
      items: records.map(listItem),
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
    const found = await riskRegisterRepository.findById(riskId);
    if (!found) throw new AppError(404, 'RISK_NOT_FOUND', 'Risk record not found');
    if (!['SECURITY_OFFICER', 'EXECUTIVE'].includes(actor.role) && found.users_risks_owner_user_idTousers?.id !== userId)
      throw new AppError(403, 'FORBIDDEN', 'Risk Owner or Security Officer access required');
    const risk: RiskRegisterDetailRecord = found;
    return {
      ...listItem(risk),
      createdBy: person(risk.users_risks_created_byTousers),
      assessments: risk.risk_assessments.map(assessment),
      threats: risk.risk_threats.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        vulnerabilities: item.risk_threat_vulnerabilities.map(
          ({ risk_vulnerabilities }) => risk_vulnerabilities,
        ),
      })),
      vulnerabilities: risk.risk_vulnerabilities.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
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
        title: item.title,
        strategy: lower(item.strategy),
        status: lower(item.status),
        owner: person(item.users_risk_treatment_plans_owner_user_idTousers),
        targetCompletionDate: item.target_completion_date,
        actionCount: item._count.risk_treatment_actions,
        progress: calculateTreatmentPlanProgress(item.risk_treatment_actions),
        updatedAt: item.updated_at,
        actions: item.risk_treatment_actions.map((action) => ({ id: action.id, title: action.action_description, assignedToUserId: action.owner_user_id, status: lower(action.status), dueDate: action.due_date })),
      })),
      incidents: risk.incident_risks.map(({ incidents: item }) => ({
        id: item.id,
        code: item.incident_code,
        title: item.title,
        severity: item.severity,
        status: lower(item.status),
        createdAt: item.created_at,
      })),
      acceptances: risk.risk_acceptances.map((item) => ({ id: item.id, decision: lower(item.decision), reason: item.reason, requestedAt: item.requested_at, validUntil: item.valid_until, requestedBy: item.requested_by, decidedBy: item.decided_by, decidedAt: item.decided_at })),
    };
  },
};
