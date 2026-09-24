-- Materialize the V3 business rules that dbdiagram exported as table comments.
-- Each expression below is copied from project-docs/Database.sql.

ALTER TABLE "departments"
  ADD CONSTRAINT "ck_departments_01" CHECK (status IN ('active', 'inactive'));

ALTER TABLE "users"
  ADD CONSTRAINT "ck_users_01" CHECK (status IN ('active', 'inactive', 'locked', 'disabled'));

ALTER TABLE "mfa_methods"
  ADD CONSTRAINT "ck_mfa_methods_01" CHECK (method_type IN ('totp', 'email'));

ALTER TABLE "import_jobs"
  ADD CONSTRAINT "ck_import_jobs_01" CHECK (import_type IN ('users', 'assets'));

ALTER TABLE "import_jobs"
  ADD CONSTRAINT "ck_import_jobs_02" CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE "import_jobs"
  ADD CONSTRAINT "ck_import_jobs_03" CHECK (
  total_rows >= 0
  AND success_rows >= 0
  AND failed_rows >= 0
  AND success_rows + failed_rows <= total_rows
);

ALTER TABLE "assets"
  ADD CONSTRAINT "ck_assets_01" CHECK (criticality IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE "assets"
  ADD CONSTRAINT "ck_assets_02" CHECK (status IN ('active', 'inactive', 'retired', 'disposed'));

ALTER TABLE "business_processes"
  ADD CONSTRAINT "ck_business_processes_01" CHECK (criticality IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE "business_processes"
  ADD CONSTRAINT "ck_business_processes_02" CHECK (status IN ('active', 'inactive'));

ALTER TABLE "vulnerabilities"
  ADD CONSTRAINT "ck_vulnerabilities_01" CHECK (
  severity IS NULL
  OR severity IN ('low', 'medium', 'high', 'critical')
);

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_01" CHECK (likelihood BETWEEN 1 AND 5);

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_02" CHECK (impact BETWEEN 1 AND 5);

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_03" CHECK (risk_score = likelihood * impact);

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_04" CHECK (risk_level IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_05" CHECK (
  residual_likelihood IS NULL
  OR residual_likelihood BETWEEN 1 AND 5
);

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_06" CHECK (
  residual_impact IS NULL
  OR residual_impact BETWEEN 1 AND 5
);

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_07" CHECK (
  residual_score IS NULL
  OR (
    residual_likelihood IS NOT NULL
    AND residual_impact IS NOT NULL
    AND residual_score = residual_likelihood * residual_impact
  )
);

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_08" CHECK (
  status IN (
    'draft',
    'pending_approval',
    'approved',
    'in_treatment',
    'closed',
    'rejected'
  )
);

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_09" CHECK (
  (asset_id IS NOT NULL AND business_process_id IS NULL)
  OR (asset_id IS NULL AND business_process_id IS NOT NULL)
);

ALTER TABLE "risk_treatment_plans"
  ADD CONSTRAINT "ck_risk_treatment_plans_01" CHECK (
  strategy IN ('avoid', 'mitigate', 'transfer', 'accept')
);

ALTER TABLE "risk_treatment_plans"
  ADD CONSTRAINT "ck_risk_treatment_plans_02" CHECK (
  status IN (
    'draft',
    'pending_approval',
    'approved',
    'in_progress',
    'completed',
    'rejected',
    'cancelled'
  )
);

ALTER TABLE "risk_treatment_plans"
  ADD CONSTRAINT "ck_risk_treatment_plans_03" CHECK (
  completed_at IS NULL
  OR completed_at >= created_at
);

ALTER TABLE "risk_treatment_actions"
  ADD CONSTRAINT "ck_risk_treatment_actions_01" CHECK (progress_percent BETWEEN 0 AND 100);

ALTER TABLE "risk_treatment_actions"
  ADD CONSTRAINT "ck_risk_treatment_actions_02" CHECK (
  status IN (
    'pending',
    'in_progress',
    'completed',
    'blocked',
    'cancelled'
  )
);

ALTER TABLE "risk_treatment_actions"
  ADD CONSTRAINT "ck_risk_treatment_actions_03" CHECK (
  completed_at IS NULL
  OR completed_at >= created_at
);

ALTER TABLE "policies"
  ADD CONSTRAINT "ck_policies_01" CHECK (
  status IN (
    'draft',
    'pending_approval',
    'published',
    'archived'
  )
);

ALTER TABLE "policy_versions"
  ADD CONSTRAINT "ck_policy_versions_01" CHECK (
  status IN (
    'draft',
    'pending_review',
    'approved',
    'published',
    'archived'
  )
);

ALTER TABLE "policy_versions"
  ADD CONSTRAINT "ck_policy_versions_02" CHECK (
  published_at IS NULL
  OR published_at >= created_at
);

ALTER TABLE "control_assessments"
  ADD CONSTRAINT "ck_control_assessments_01" CHECK (
  compliance_status IN (
    'compliant',
    'partially_compliant',
    'non_compliant',
    'not_assessed'
  )
);

ALTER TABLE "control_assessments"
  ADD CONSTRAINT "ck_control_assessments_02" CHECK (
  score IS NULL
  OR score BETWEEN 0 AND 100
);

ALTER TABLE "control_assessments"
  ADD CONSTRAINT "ck_control_assessments_03" CHECK (
  next_review_at IS NULL
  OR next_review_at >= assessed_at
);

ALTER TABLE "incidents"
  ADD CONSTRAINT "ck_incidents_01" CHECK (
  severity IN ('low', 'medium', 'high', 'critical')
);

ALTER TABLE "incidents"
  ADD CONSTRAINT "ck_incidents_02" CHECK (
  status IN (
    'reported',
    'assigned',
    'in_progress',
    'escalated',
    'resolved',
    'closed'
  )
);

ALTER TABLE "incidents"
  ADD CONSTRAINT "ck_incidents_03" CHECK (
  occurred_at IS NULL
  OR occurred_at <= detected_at
);

ALTER TABLE "incidents"
  ADD CONSTRAINT "ck_incidents_04" CHECK (
  resolved_at IS NULL
  OR resolved_at >= detected_at
);

ALTER TABLE "incidents"
  ADD CONSTRAINT "ck_incidents_05" CHECK (
  closed_at IS NULL
  OR (
    resolved_at IS NOT NULL
    AND closed_at >= resolved_at
  )
);

ALTER TABLE "incident_assignments"
  ADD CONSTRAINT "ck_incident_assignments_01" CHECK (
  (assignee_user_id IS NOT NULL AND assignee_team_id IS NULL)
  OR (assignee_user_id IS NULL AND assignee_team_id IS NOT NULL)
);

ALTER TABLE "incident_assignments"
  ADD CONSTRAINT "ck_incident_assignments_02" CHECK (
  completed_at IS NULL
  OR completed_at >= assigned_at
);

ALTER TABLE "incident_updates"
  ADD CONSTRAINT "ck_incident_updates_01" CHECK (
  status_from IS NULL
  OR status_from IN ('reported', 'assigned', 'in_progress', 'escalated', 'resolved', 'closed')
);

ALTER TABLE "incident_updates"
  ADD CONSTRAINT "ck_incident_updates_02" CHECK (
  status_to IS NULL
  OR status_to IN ('reported', 'assigned', 'in_progress', 'escalated', 'resolved', 'closed')
);

ALTER TABLE "integrations"
  ADD CONSTRAINT "ck_integrations_01" CHECK (
  integration_type IN (
    'siem',
    'firewall',
    'log_source',
    'api'
  )
);

ALTER TABLE "integrations"
  ADD CONSTRAINT "ck_integrations_02" CHECK (
  status IN (
    'active',
    'inactive',
    'error',
    'disabled'
  )
);

ALTER TABLE "sync_jobs"
  ADD CONSTRAINT "ck_sync_jobs_01" CHECK (
  status IN (
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled'
  )
);

ALTER TABLE "sync_jobs"
  ADD CONSTRAINT "ck_sync_jobs_02" CHECK (
  records_processed >= 0
  AND records_failed >= 0
);

ALTER TABLE "sync_jobs"
  ADD CONSTRAINT "ck_sync_jobs_03" CHECK (
  completed_at IS NULL
  OR (
    started_at IS NOT NULL
    AND completed_at >= started_at
  )
);

ALTER TABLE "log_sources"
  ADD CONSTRAINT "ck_log_sources_01" CHECK (
  source_type IN (
    'application',
    'system',
    'authentication',
    'network',
    'firewall',
    'external'
  )
);

ALTER TABLE "log_sources"
  ADD CONSTRAINT "ck_log_sources_02" CHECK (
  status IN ('active', 'inactive', 'error')
);

ALTER TABLE "security_events"
  ADD CONSTRAINT "ck_security_events_01" CHECK (
  severity IS NULL
  OR severity IN ('low', 'medium', 'high', 'critical')
);

ALTER TABLE "ai_alerts"
  ADD CONSTRAINT "ck_ai_alerts_01" CHECK (anomaly_score BETWEEN 0 AND 1);

ALTER TABLE "ai_alerts"
  ADD CONSTRAINT "ck_ai_alerts_02" CHECK (
  risk_score IS NULL
  OR risk_score BETWEEN 0 AND 100
);

ALTER TABLE "ai_alerts"
  ADD CONSTRAINT "ck_ai_alerts_03" CHECK (
  risk_level IS NULL
  OR risk_level IN ('low', 'medium', 'high', 'critical')
);

ALTER TABLE "ai_alerts"
  ADD CONSTRAINT "ck_ai_alerts_04" CHECK (
  status IN (
    'new',
    'reviewing',
    'confirmed',
    'false_positive',
    'resolved',
    'dismissed'
  )
);

ALTER TABLE "ai_alerts"
  ADD CONSTRAINT "ck_ai_alerts_05" CHECK (
  reviewed_at IS NULL
  OR reviewed_at >= detected_at
);

ALTER TABLE "ai_feedback"
  ADD CONSTRAINT "ck_ai_feedback_01" CHECK (
  feedback_label IN (
    'confirmed_incident',
    'false_positive',
    'needs_review'
  )
);

ALTER TABLE "asset_alert_thresholds"
  ADD CONSTRAINT "ck_asset_alert_thresholds_01" CHECK (threshold BETWEEN 0 AND 1);

ALTER TABLE "asset_alert_thresholds"
  ADD CONSTRAINT "ck_asset_alert_thresholds_02" CHECK (
  risk_level_min IS NULL
  OR risk_level_min IN ('low', 'medium', 'high', 'critical')
);

ALTER TABLE "training_courses"
  ADD CONSTRAINT "ck_training_courses_01" CHECK (
  status IN ('draft', 'published', 'archived')
);

ALTER TABLE "training_campaigns"
  ADD CONSTRAINT "ck_training_campaigns_01" CHECK (due_date >= start_date);

ALTER TABLE "training_campaign_targets"
  ADD CONSTRAINT "ck_training_campaign_targets_01" CHECK (
  (user_id IS NOT NULL AND department_id IS NULL)
  OR (user_id IS NULL AND department_id IS NOT NULL)
);

ALTER TABLE "training_enrollments"
  ADD CONSTRAINT "ck_training_enrollments_01" CHECK (
  status IN (
    'assigned',
    'in_progress',
    'completed',
    'overdue',
    'cancelled'
  )
);

ALTER TABLE "training_enrollments"
  ADD CONSTRAINT "ck_training_enrollments_02" CHECK (progress_percent BETWEEN 0 AND 100);

ALTER TABLE "training_enrollments"
  ADD CONSTRAINT "ck_training_enrollments_03" CHECK (
  completed_at IS NULL
  OR (
    started_at IS NOT NULL
    AND completed_at >= started_at
  )
);

ALTER TABLE "quizzes"
  ADD CONSTRAINT "ck_quizzes_01" CHECK (passing_score BETWEEN 0 AND 100);

ALTER TABLE "quizzes"
  ADD CONSTRAINT "ck_quizzes_02" CHECK (max_attempts > 0);

ALTER TABLE "quiz_questions"
  ADD CONSTRAINT "ck_quiz_questions_01" CHECK (
  question_type IN (
    'single_choice',
    'multiple_choice',
    'true_false',
    'short_answer'
  )
);

ALTER TABLE "quiz_questions"
  ADD CONSTRAINT "ck_quiz_questions_02" CHECK (score >= 0);

ALTER TABLE "quiz_questions"
  ADD CONSTRAINT "ck_quiz_questions_03" CHECK (display_order > 0);

ALTER TABLE "quiz_options"
  ADD CONSTRAINT "ck_quiz_options_01" CHECK (display_order > 0);

ALTER TABLE "quiz_attempts"
  ADD CONSTRAINT "ck_quiz_attempts_01" CHECK (
  score IS NULL
  OR score BETWEEN 0 AND 100
);

ALTER TABLE "quiz_attempts"
  ADD CONSTRAINT "ck_quiz_attempts_02" CHECK (
  submitted_at IS NULL
  OR submitted_at >= started_at
);

ALTER TABLE "scheduled_reports"
  ADD CONSTRAINT "ck_scheduled_reports_01" CHECK (
  report_type IN (
    'risk',
    'compliance',
    'incident',
    'training',
    'security_kpi',
    'executive_summary'
  )
);

ALTER TABLE "scheduled_reports"
  ADD CONSTRAINT "ck_scheduled_reports_02" CHECK (
  format IN ('pdf', 'excel')
);

ALTER TABLE "report_runs"
  ADD CONSTRAINT "ck_report_runs_01" CHECK (
  status IN (
    'pending',
    'processing',
    'completed',
    'failed'
  )
);

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "ck_notification_deliveries_01" CHECK (
  channel IN ('in_app', 'email')
);

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "ck_notification_deliveries_02" CHECK (
  status IN (
    'pending',
    'sent',
    'delivered',
    'failed'
  )
);

ALTER TABLE "workflow_steps"
  ADD CONSTRAINT "ck_workflow_steps_01" CHECK (step_order > 0);

ALTER TABLE "workflow_steps"
  ADD CONSTRAINT "ck_workflow_steps_02" CHECK (required_approvals > 0);

ALTER TABLE "workflow_steps"
  ADD CONSTRAINT "ck_workflow_steps_03" CHECK (
  due_hours IS NULL
  OR due_hours > 0
);

ALTER TABLE "approval_requests"
  ADD CONSTRAINT "ck_approval_requests_01" CHECK (current_step > 0);

ALTER TABLE "approval_requests"
  ADD CONSTRAINT "ck_approval_requests_02" CHECK (
  status IN (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'expired'
  )
);

ALTER TABLE "approval_requests"
  ADD CONSTRAINT "ck_approval_requests_03" CHECK (
  completed_at IS NULL
  OR completed_at >= submitted_at
);

ALTER TABLE "approval_actions"
  ADD CONSTRAINT "ck_approval_actions_01" CHECK (
  decision IN (
    'approved',
    'rejected',
    'returned'
  )
);

ALTER TABLE "approval_delegations"
  ADD CONSTRAINT "ck_approval_delegations_01" CHECK (delegator_user_id <> delegate_user_id);

ALTER TABLE "approval_delegations"
  ADD CONSTRAINT "ck_approval_delegations_02" CHECK (end_at > start_at);

