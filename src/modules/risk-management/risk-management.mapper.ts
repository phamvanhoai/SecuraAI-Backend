import type {
  RiskAssessmentDetailRecord,
  RiskAssessmentDetailWithApprovals,
  RiskAssessmentListRecord,
  TreatmentPlanListRecord,
  TreatmentPlanDetailRecord,
} from './risk-management.repository.js';

export const toTreatmentPlanDetail = (plan: TreatmentPlanDetailRecord) => {
  const activeActions = plan.risk_treatment_actions.filter(({ status }) => status !== 'cancelled');
  const progressPercent = activeActions.length
    ? Math.round(
        activeActions.reduce((total, action) => total + action.progress_percent, 0) /
          activeActions.length,
      )
    : null;
  const currentStep = plan.approval?.workflow_definitions.workflow_steps.find(
    ({ step_order }) => step_order === plan.approval?.current_step,
  );
  const target = plan.risk_assessments.assets
    ? {
        type: 'asset' as const,
        id: plan.risk_assessments.assets.asset_id,
        code: plan.risk_assessments.assets.asset_code,
        name: plan.risk_assessments.assets.name,
        deleted: plan.risk_assessments.assets.deleted_at !== null,
      }
    : {
        type: 'businessProcess' as const,
        id: plan.risk_assessments.business_processes?.business_process_id ?? '',
        code: plan.risk_assessments.business_processes?.code ?? '',
        name: plan.risk_assessments.business_processes?.name ?? 'Unknown business process',
        deleted: false,
      };
  return {
    id: plan.risk_treatment_plan_id,
    strategy: plan.strategy,
    description: plan.description,
    status: plan.status,
    owner: person(plan.users_risk_treatment_plans_owner_user_idTousers),
    createdBy: person(plan.users_risk_treatment_plans_created_by_user_idTousers),
    targetDate: plan.target_date,
    submittedAt: plan.submitted_at,
    completedAt: plan.completed_at,
    cancellation: plan.cancelled_at
      ? {
          cancelledAt: plan.cancelled_at,
          reason: plan.cancellation_reason ?? '',
          cancelledBy: person(plan.users_risk_treatment_plans_cancelled_by_user_idTousers),
        }
      : null,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
    progressPercent,
    completedActions: activeActions.filter(({ status }) => status === 'completed').length,
    totalActions: activeActions.length,
    isOverdue:
      plan.target_date !== null &&
      plan.target_date < new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z') &&
      !['completed', 'cancelled'].includes(plan.status),
    risk: {
      id: plan.risk_assessments.risk_assessment_id,
      riskCode: plan.risk_assessments.risk_code,
      title: plan.risk_assessments.title,
      description: plan.risk_assessments.description,
      score: plan.risk_assessments.risk_score,
      level: plan.risk_assessments.risk_level,
      status: plan.risk_assessments.status,
      target,
    },
    approval: plan.approval
      ? {
          id: plan.approval.approval_request_id,
          status: plan.approval.status,
          currentStep: plan.approval.current_step,
          currentStepName: currentStep?.name ?? null,
          approverRole: currentStep?.roles
            ? { code: currentStep.roles.code, name: currentStep.roles.name }
            : null,
          submissionNote: plan.approval.submission_note,
          submittedAt: plan.approval.submitted_at,
          completedAt: plan.approval.completed_at,
          submittedBy: person(plan.approval.users),
        }
      : null,
    actions: plan.risk_treatment_actions.map((action) => ({
      id: action.risk_treatment_action_id,
      title: action.title,
      description: action.description,
      assignee: person(action.users),
      dueDate: action.due_date,
      progressPercent: action.progress_percent,
      status: action.status,
      completedAt: action.completed_at,
      createdAt: action.created_at,
      updatedAt: action.updated_at,
    })),
  };
};

export const toTreatmentPlanListItem = (plan: TreatmentPlanListRecord) => ({
  id: plan.risk_treatment_plan_id,
  risk: {
    id: plan.risk_assessments.risk_assessment_id,
    riskCode: plan.risk_assessments.risk_code,
    title: plan.risk_assessments.title,
    riskLevel: plan.risk_assessments.risk_level,
    status: plan.risk_assessments.status,
  },
  strategy: plan.strategy,
  status: plan.status,
  owner: person(plan.users_risk_treatment_plans_owner_user_idTousers),
  targetDate: plan.target_date,
  progressPercent: plan.actionProgress === null ? null : Math.round(plan.actionProgress),
  completedActions: plan.completedActions,
  totalActions: plan.totalActions,
  isOverdue:
    plan.target_date !== null &&
    plan.target_date < new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z') &&
    !['completed', 'cancelled'].includes(plan.status),
  createdAt: plan.created_at,
  updatedAt: plan.updated_at,
});

export const toRiskAssessmentListItem = (risk: RiskAssessmentListRecord) => ({
  id: risk.risk_assessment_id,
  riskCode: risk.risk_code,
  title: risk.title,
  likelihood: risk.likelihood,
  impact: risk.impact,
  riskScore: risk.risk_score,
  riskLevel: risk.risk_level,
  status: risk.status,
  target: risk.assets
    ? {
        type: 'asset' as const,
        id: risk.assets.asset_id,
        code: risk.assets.asset_code,
        name: risk.assets.name,
        deleted: risk.assets.deleted_at !== null,
      }
    : {
        type: 'businessProcess' as const,
        id: risk.business_processes?.business_process_id ?? '',
        code: risk.business_processes?.code ?? '',
        name: risk.business_processes?.name ?? 'Unknown business process',
      },
  assessedBy: risk.users
    ? {
        id: risk.users.user_id,
        fullName: risk.users.full_name,
        deleted: risk.users.deleted_at !== null,
      }
    : null,
  hasTreatmentPlan: risk._count.risk_treatment_plans > 0,
  assessedAt: risk.assessed_at,
  updatedAt: risk.updated_at,
});

const person = (
  user: { user_id: string; full_name: string; status?: string; deleted_at: Date | null } | null,
) =>
  user
    ? {
        id: user.user_id,
        fullName: user.full_name,
        inactive: user.deleted_at !== null || ('status' in user && user.status !== 'active'),
      }
    : null;

const residualLevel = (score: number): 'low' | 'medium' | 'high' | 'critical' => {
  if (score <= 4) return 'low';
  if (score <= 9) return 'medium';
  if (score <= 16) return 'high';
  return 'critical';
};

export const toRiskAssessmentDetail = (
  risk: RiskAssessmentDetailRecord | RiskAssessmentDetailWithApprovals,
) => ({
  assessment: {
    id: risk.risk_assessment_id,
    riskCode: risk.risk_code,
    title: risk.title,
    description: risk.description,
    status: risk.status,
    assessedAt: risk.assessed_at,
    closedAt: risk.closed_at,
    createdAt: risk.created_at,
    updatedAt: risk.updated_at,
    assessedBy: person(risk.users),
    cancellation:
      risk.status === 'cancelled'
        ? {
            reason: risk.cancellation_reason ?? '',
            cancelledAt: risk.cancelled_at,
            cancelledBy:
              risk.cancelled_by_user_id && risk.cancelled_by_full_name
                ? {
                    id: risk.cancelled_by_user_id,
                    fullName: risk.cancelled_by_full_name,
                    inactive: false,
                  }
                : null,
          }
        : null,
  },
  target: risk.assets
    ? {
        type: 'asset' as const,
        id: risk.assets.asset_id,
        code: risk.assets.asset_code,
        name: risk.assets.name,
        status: risk.assets.status,
        deleted: risk.assets.deleted_at !== null,
      }
    : {
        type: 'businessProcess' as const,
        id: risk.business_processes?.business_process_id ?? '',
        code: risk.business_processes?.code ?? '',
        name: risk.business_processes?.name ?? 'Unknown business process',
        status: risk.business_processes?.status ?? 'unknown',
      },
  inherentRisk: {
    likelihood: risk.likelihood,
    impact: risk.impact,
    score: risk.risk_score,
    level: risk.risk_level,
  },
  residualRisk:
    risk.residual_score === null
      ? null
      : {
          likelihood: risk.residual_likelihood,
          impact: risk.residual_impact,
          score: risk.residual_score,
          level: residualLevel(risk.residual_score),
          reduction: risk.risk_score - risk.residual_score,
        },
  threats: risk.risk_assessment_threats.map(({ threats, notes }) => ({
    id: threats.threat_id,
    code: threats.code,
    name: threats.name,
    description: threats.description,
    category: threats.category,
    notes,
  })),
  vulnerabilities: risk.risk_assessment_vulnerabilities.map(({ vulnerabilities, notes }) => ({
    id: vulnerabilities.vulnerability_id,
    code: vulnerabilities.code,
    name: vulnerabilities.name,
    description: vulnerabilities.description,
    severity: vulnerabilities.severity,
    notes,
  })),
  treatmentPlans: risk.risk_treatment_plans.map((plan) => {
    const approvalHistory =
      'treatmentPlanApprovals' in risk
        ? risk.treatmentPlanApprovals.filter(
            ({ entity_id }) => entity_id === plan.risk_treatment_plan_id,
          )
        : [];
    const approval = approvalHistory[0];
    const currentStep = approval?.workflow_definitions.workflow_steps.find(
      ({ step_order }) => step_order === approval.current_step,
    );
    const latestDecision = approval?.approval_actions[0];
    return {
      id: plan.risk_treatment_plan_id,
      strategy: plan.strategy,
      description: plan.description,
      owner: person(plan.users_risk_treatment_plans_owner_user_idTousers),
      createdBy: person(plan.users_risk_treatment_plans_created_by_user_idTousers),
      targetDate: plan.target_date,
      status: plan.status,
      submittedAt: plan.submitted_at,
      completedAt: plan.completed_at,
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
      approval: approval
        ? {
            id: approval.approval_request_id,
            status: approval.status,
            currentStep: approval.current_step,
            currentStepName: currentStep?.name ?? null,
            approverRole: currentStep?.roles
              ? { code: currentStep.roles.code, name: currentStep.roles.name }
              : null,
            submissionNote: approval.submission_note,
            submittedAt: approval.submitted_at,
            completedAt: approval.completed_at,
            submittedBy: person(approval.users),
            latestDecision: latestDecision
              ? {
                  decision: latestDecision.decision,
                  comment: latestDecision.comment,
                  actedAt: latestDecision.acted_at,
                  actedBy: person(latestDecision.users),
                }
              : null,
            history: approvalHistory.flatMap((item) =>
              item.approval_actions.length
                ? item.approval_actions.map((action) => ({
                    type: action.decision === 'returned' ? 'revision' : action.decision,
                    decision: action.decision ?? null,
                    comment: action.comment,
                    actedAt: action.acted_at,
                    actedBy: person(action.users),
                    approvalRequestId: item.approval_request_id,
                    submittedAt: item.submitted_at,
                    completedAt: item.completed_at,
                  }))
                : [
                    {
                      type: 'submission',
                    decision: 'submitted',
                      comment: item.submission_note,
                      actedAt: item.submitted_at,
                      actedBy: person(item.users),
                      approvalRequestId: item.approval_request_id,
                      submittedAt: item.submitted_at,
                      completedAt: item.completed_at,
                    },
                  ],
            ),
          }
        : null,
      actions: plan.risk_treatment_actions.map((action) => ({
        id: action.risk_treatment_action_id,
        title: action.title,
        description: action.description,
        assignee: person(action.users),
        dueDate: action.due_date,
        progressPercent: action.progress_percent,
        status: action.status,
        completedAt: action.completed_at,
      })),
    };
  }),
  previousAssessment: risk.risk_assessments
    ? {
        id: risk.risk_assessments.risk_assessment_id,
        riskCode: risk.risk_assessments.risk_code,
        title: risk.risk_assessments.title,
        score: risk.risk_assessments.risk_score,
        level: risk.risk_assessments.risk_level,
        assessedAt: risk.risk_assessments.assessed_at,
        assessedBy: person(risk.risk_assessments.users),
      }
    : null,
});
