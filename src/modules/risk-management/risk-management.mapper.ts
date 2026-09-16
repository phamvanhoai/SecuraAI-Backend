import type {
  RiskAssessmentDetailRecord,
  RiskAssessmentListRecord,
} from './risk-management.repository.js';

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

export const toRiskAssessmentDetail = (risk: RiskAssessmentDetailRecord) => ({
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
  treatmentPlans: risk.risk_treatment_plans.map((plan) => ({
    id: plan.risk_treatment_plan_id,
    strategy: plan.strategy,
    description: plan.description,
    owner: person(plan.users_risk_treatment_plans_owner_user_idTousers),
    targetDate: plan.target_date,
    status: plan.status,
    submittedAt: plan.submitted_at,
    completedAt: plan.completed_at,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
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
  })),
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
