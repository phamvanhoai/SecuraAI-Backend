-- Replace the initial application skeleton with the approved SecuraAI V3 schema.
-- Supabase-managed schemas and public._prisma_migrations are intentionally preserved.
DROP TABLE IF EXISTS
  "auth_sessions",
  "role_permissions",
  "user_roles",
  "permissions",
  "roles",
  "users",
  "departments"
CASCADE;

DROP TYPE IF EXISTS "UserStatus";

CREATE TABLE "departments" (
  "department_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "code" varchar(50) UNIQUE NOT NULL,
  "name" varchar(150) NOT NULL,
  "description" text,
  "parent_department_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "users" (
  "user_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "department_id" uuid,
  "email" varchar(255) UNIQUE NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "full_name" varchar(150) NOT NULL,
  "phone" varchar(30),
  "employee_code" varchar(50) UNIQUE,
  "avatar_url" text,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "must_change_password" boolean NOT NULL DEFAULT false,
  "email_verified_at" timestamptz,
  "last_login_at" timestamptz,
  "locked_at" timestamptz,
  "disabled_at" timestamptz,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "deleted_at" timestamptz
);

CREATE TABLE "roles" (
  "role_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "code" varchar(50) UNIQUE NOT NULL,
  "name" varchar(100) NOT NULL,
  "description" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "permissions" (
  "permission_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "code" varchar(100) UNIQUE NOT NULL,
  "module" varchar(50) NOT NULL,
  "action" varchar(50) NOT NULL,
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "user_roles" (
  "user_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "assigned_by_user_id" uuid,
  "assigned_at" timestamptz NOT NULL DEFAULT (now()),
  PRIMARY KEY ("user_id", "role_id")
);

CREATE TABLE "role_permissions" (
  "role_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  PRIMARY KEY ("role_id", "permission_id")
);

CREATE TABLE "auth_sessions" (
  "auth_session_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "refresh_token_hash" varchar(255) NOT NULL,
  "ip_address" inet,
  "user_agent" text,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "mfa_methods" (
  "mfa_method_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "method_type" varchar(20) NOT NULL,
  "secret_encrypted" text,
  "is_enabled" boolean NOT NULL DEFAULT false,
  "verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "password_reset_tokens" (
  "password_reset_token_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "token_hash" varchar(255) UNIQUE NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "login_history" (
  "login_history_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid,
  "email_attempted" varchar(255) NOT NULL,
  "ip_address" inet,
  "user_agent" text,
  "success" boolean NOT NULL,
  "failure_reason" varchar(255),
  "logged_in_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "teams" (
  "team_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(150) UNIQUE NOT NULL,
  "description" text,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "team_members" (
  "team_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "joined_at" timestamptz NOT NULL DEFAULT (now()),
  PRIMARY KEY ("team_id", "user_id")
);

CREATE TABLE "files" (
  "file_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "original_name" varchar(255) NOT NULL,
  "storage_key" text UNIQUE NOT NULL,
  "mime_type" varchar(100),
  "size_bytes" bigint,
  "checksum" varchar(128),
  "uploaded_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "import_jobs" (
  "import_job_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "import_type" varchar(30) NOT NULL,
  "file_id" uuid NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "total_rows" integer NOT NULL DEFAULT 0,
  "success_rows" integer NOT NULL DEFAULT 0,
  "failed_rows" integer NOT NULL DEFAULT 0,
  "error_details" jsonb,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "completed_at" timestamptz
);

CREATE TABLE "assets" (
  "asset_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "asset_code" varchar(50) UNIQUE NOT NULL,
  "name" varchar(150) NOT NULL,
  "asset_type" varchar(50) NOT NULL,
  "description" text,
  "department_id" uuid,
  "owner_user_id" uuid,
  "criticality" varchar(20) NOT NULL DEFAULT 'medium',
  "hostname" varchar(255),
  "ip_address" inet,
  "location" varchar(255),
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "metadata" jsonb,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "retired_at" timestamptz,
  "deleted_at" timestamptz
);

CREATE TABLE "asset_change_history" (
  "asset_change_history_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "asset_id" uuid NOT NULL,
  "changed_by_user_id" uuid,
  "action" varchar(30) NOT NULL,
  "before_data" jsonb,
  "after_data" jsonb,
  "changed_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "business_processes" (
  "business_process_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "code" varchar(50) UNIQUE NOT NULL,
  "name" varchar(150) NOT NULL,
  "department_id" uuid,
  "owner_user_id" uuid,
  "description" text,
  "criticality" varchar(20) NOT NULL DEFAULT 'medium',
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "threats" (
  "threat_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "code" varchar(50) UNIQUE NOT NULL,
  "name" varchar(150) NOT NULL,
  "description" text,
  "category" varchar(100),
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "vulnerabilities" (
  "vulnerability_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "code" varchar(50) UNIQUE NOT NULL,
  "name" varchar(150) NOT NULL,
  "description" text,
  "severity" varchar(20),
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "risk_assessments" (
  "risk_assessment_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "risk_code" varchar(50) UNIQUE NOT NULL,
  "asset_id" uuid,
  "business_process_id" uuid,
  "title" varchar(255) NOT NULL,
  "description" text,
  "likelihood" smallint NOT NULL,
  "impact" smallint NOT NULL,
  "risk_score" smallint NOT NULL,
  "risk_level" varchar(20) NOT NULL,
  "residual_likelihood" smallint,
  "residual_impact" smallint,
  "residual_score" smallint,
  "status" varchar(30) NOT NULL DEFAULT 'draft',
  "assessed_by_user_id" uuid,
  "previous_risk_assessment_id" uuid,
  "assessed_at" timestamptz NOT NULL DEFAULT (now()),
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "risk_assessment_threats" (
  "risk_assessment_id" uuid NOT NULL,
  "threat_id" uuid NOT NULL,
  "notes" text,
  PRIMARY KEY ("risk_assessment_id", "threat_id")
);

CREATE TABLE "risk_assessment_vulnerabilities" (
  "risk_assessment_id" uuid NOT NULL,
  "vulnerability_id" uuid NOT NULL,
  "notes" text,
  PRIMARY KEY ("risk_assessment_id", "vulnerability_id")
);

CREATE TABLE "risk_treatment_plans" (
  "risk_treatment_plan_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "risk_assessment_id" uuid NOT NULL,
  "strategy" varchar(30) NOT NULL,
  "description" text NOT NULL,
  "owner_user_id" uuid,
  "target_date" date,
  "status" varchar(30) NOT NULL DEFAULT 'draft',
  "submitted_at" timestamptz,
  "completed_at" timestamptz,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "risk_treatment_actions" (
  "risk_treatment_action_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "risk_treatment_plan_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "assigned_to_user_id" uuid,
  "due_date" date,
  "progress_percent" smallint NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "policies" (
  "policy_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "policy_code" varchar(50) UNIQUE NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "owner_user_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "policy_versions" (
  "policy_version_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "policy_id" uuid NOT NULL,
  "version_number" varchar(30) NOT NULL,
  "content" text NOT NULL,
  "change_summary" text,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "effective_date" date,
  "created_by_user_id" uuid,
  "published_by_user_id" uuid,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "policy_departments" (
  "policy_id" uuid NOT NULL,
  "department_id" uuid NOT NULL,
  "assigned_by_user_id" uuid,
  "assigned_at" timestamptz NOT NULL DEFAULT (now()),
  PRIMARY KEY ("policy_id", "department_id")
);

CREATE TABLE "policy_acknowledgements" (
  "policy_acknowledgement_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "policy_version_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "acknowledged_at" timestamptz NOT NULL DEFAULT (now()),
  "ip_address" inet
);

CREATE TABLE "compliance_frameworks" (
  "compliance_framework_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "code" varchar(50) NOT NULL,
  "name" varchar(150) NOT NULL,
  "version" varchar(50),
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "compliance_controls" (
  "compliance_control_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "compliance_framework_id" uuid NOT NULL,
  "control_code" varchar(50) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "parent_compliance_control_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "policy_control_mappings" (
  "policy_version_id" uuid NOT NULL,
  "compliance_control_id" uuid NOT NULL,
  "notes" text,
  PRIMARY KEY ("policy_version_id", "compliance_control_id")
);

CREATE TABLE "control_assessments" (
  "control_assessment_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "compliance_control_id" uuid NOT NULL,
  "assessed_by_user_id" uuid,
  "compliance_status" varchar(30) NOT NULL,
  "score" numeric(5,2),
  "notes" text,
  "assessed_at" timestamptz NOT NULL DEFAULT (now()),
  "next_review_at" timestamptz
);

CREATE TABLE "compliance_evidence" (
  "compliance_evidence_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "control_assessment_id" uuid NOT NULL,
  "file_id" uuid NOT NULL,
  "description" text,
  "uploaded_by_user_id" uuid,
  "valid_until" date,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "incidents" (
  "incident_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "incident_code" varchar(50) UNIQUE NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "category" varchar(100),
  "severity" varchar(20) NOT NULL DEFAULT 'medium',
  "status" varchar(30) NOT NULL DEFAULT 'reported',
  "reported_by_user_id" uuid,
  "occurred_at" timestamptz,
  "detected_at" timestamptz NOT NULL DEFAULT (now()),
  "escalated_at" timestamptz,
  "resolved_at" timestamptz,
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "incident_assignments" (
  "incident_assignment_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "incident_id" uuid NOT NULL,
  "assignee_user_id" uuid,
  "assignee_team_id" uuid,
  "assigned_by_user_id" uuid,
  "assigned_at" timestamptz NOT NULL DEFAULT (now()),
  "completed_at" timestamptz
);

CREATE TABLE "incident_updates" (
  "incident_update_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "incident_id" uuid NOT NULL,
  "user_id" uuid,
  "status_from" varchar(30),
  "status_to" varchar(30),
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "incident_evidence" (
  "incident_evidence_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "incident_id" uuid NOT NULL,
  "file_id" uuid NOT NULL,
  "description" text,
  "uploaded_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "incident_risk_links" (
  "incident_id" uuid NOT NULL,
  "risk_assessment_id" uuid NOT NULL,
  "linked_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  PRIMARY KEY ("incident_id", "risk_assessment_id")
);

CREATE TABLE "post_incident_reports" (
  "post_incident_report_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "incident_id" uuid UNIQUE NOT NULL,
  "root_cause" text,
  "impact_summary" text,
  "lessons_learned" text,
  "corrective_actions" text,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "integrations" (
  "integration_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(150) NOT NULL,
  "integration_type" varchar(50) NOT NULL,
  "base_url" text,
  "configuration" jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'inactive',
  "last_connected_at" timestamptz,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "integration_api_keys" (
  "integration_api_key_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "integration_id" uuid NOT NULL,
  "key_name" varchar(100) NOT NULL,
  "secret_encrypted" text NOT NULL,
  "key_fingerprint" varchar(100),
  "expires_at" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "sync_schedules" (
  "sync_schedule_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "integration_id" uuid NOT NULL,
  "schedule_expression" varchar(100) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_run_at" timestamptz,
  "next_run_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "sync_jobs" (
  "sync_job_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "integration_id" uuid NOT NULL,
  "sync_schedule_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "records_processed" integer NOT NULL DEFAULT 0,
  "records_failed" integer NOT NULL DEFAULT 0,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "integration_logs" (
  "integration_log_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "integration_id" uuid NOT NULL,
  "sync_job_id" uuid,
  "level" varchar(20) NOT NULL,
  "message" text NOT NULL,
  "details" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "log_sources" (
  "log_source_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(150) NOT NULL,
  "source_type" varchar(50) NOT NULL,
  "asset_id" uuid,
  "integration_id" uuid,
  "configuration" jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "last_received_at" timestamptz,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "security_events" (
  "security_event_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "log_source_id" uuid NOT NULL,
  "external_event_id" varchar(255),
  "event_type" varchar(100) NOT NULL,
  "severity" varchar(20),
  "event_time" timestamptz NOT NULL,
  "source_ip" inet,
  "destination_ip" inet,
  "raw_payload" jsonb,
  "normalized_data" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "ai_model_versions" (
  "ai_model_version_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "model_name" varchar(150) NOT NULL,
  "algorithm" varchar(100) NOT NULL,
  "version" varchar(50) NOT NULL,
  "provider" varchar(150),
  "model_path" text,
  "parameters" jsonb,
  "is_active" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "ai_alerts" (
  "ai_alert_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "alert_code" varchar(50) UNIQUE NOT NULL,
  "security_event_id" uuid NOT NULL,
  "log_source_id" uuid NOT NULL,
  "asset_id" uuid,
  "ai_model_version_id" uuid NOT NULL,
  "anomaly_score" numeric(8,6) NOT NULL,
  "risk_score" numeric(8,4),
  "risk_level" varchar(20),
  "title" varchar(255) NOT NULL,
  "description" text,
  "status" varchar(30) NOT NULL DEFAULT 'new',
  "detected_at" timestamptz NOT NULL DEFAULT (now()),
  "reviewed_by_user_id" uuid,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "ai_alert_explanations" (
  "ai_alert_explanation_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "ai_alert_id" uuid NOT NULL,
  "explanation_text" text NOT NULL,
  "feature_contributions" jsonb,
  "baseline_data" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "ai_feedback" (
  "ai_feedback_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "ai_alert_id" uuid NOT NULL,
  "reviewed_by_user_id" uuid,
  "feedback_label" varchar(30) NOT NULL,
  "comment" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "asset_alert_thresholds" (
  "asset_alert_threshold_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "asset_id" uuid UNIQUE NOT NULL,
  "threshold" numeric(8,6) NOT NULL,
  "risk_level_min" varchar(20),
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_by_user_id" uuid,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "incident_alert_links" (
  "incident_id" uuid NOT NULL,
  "ai_alert_id" uuid NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  PRIMARY KEY ("incident_id", "ai_alert_id")
);

CREATE TABLE "training_courses" (
  "training_course_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "title" varchar(255) NOT NULL,
  "description" text,
  "content" text,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "training_campaigns" (
  "training_campaign_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "training_course_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "assigned_by_user_id" uuid,
  "start_date" date NOT NULL,
  "due_date" date NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "training_campaign_targets" (
  "training_campaign_target_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "training_campaign_id" uuid NOT NULL,
  "user_id" uuid,
  "department_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "training_enrollments" (
  "training_enrollment_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "training_campaign_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'assigned',
  "progress_percent" smallint NOT NULL DEFAULT 0,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "last_accessed_at" timestamptz
);

CREATE TABLE "quizzes" (
  "quiz_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "training_course_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "passing_score" numeric(5,2) NOT NULL,
  "max_attempts" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "quiz_questions" (
  "quiz_question_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "quiz_id" uuid NOT NULL,
  "question_text" text NOT NULL,
  "question_type" varchar(30) NOT NULL,
  "score" numeric(5,2) NOT NULL DEFAULT 1,
  "display_order" integer NOT NULL DEFAULT 1
);

CREATE TABLE "quiz_options" (
  "quiz_option_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "quiz_question_id" uuid NOT NULL,
  "option_text" text NOT NULL,
  "is_correct" boolean NOT NULL DEFAULT false,
  "display_order" integer NOT NULL DEFAULT 1
);

CREATE TABLE "quiz_attempts" (
  "quiz_attempt_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "quiz_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "score" numeric(5,2),
  "passed" boolean,
  "started_at" timestamptz NOT NULL DEFAULT (now()),
  "submitted_at" timestamptz
);

CREATE TABLE "quiz_answers" (
  "quiz_answer_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "quiz_attempt_id" uuid NOT NULL,
  "quiz_question_id" uuid NOT NULL,
  "selected_quiz_option_id" uuid,
  "answer_text" text,
  "is_correct" boolean,
  "score_awarded" numeric(5,2)
);

CREATE TABLE "training_certificates" (
  "training_certificate_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "training_enrollment_id" uuid UNIQUE NOT NULL,
  "certificate_number" varchar(100) UNIQUE NOT NULL,
  "file_id" uuid,
  "issued_at" timestamptz NOT NULL DEFAULT (now()),
  "issued_by_user_id" uuid
);

CREATE TABLE "dashboard_preferences" (
  "dashboard_preference_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid UNIQUE NOT NULL,
  "layout" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "scheduled_reports" (
  "scheduled_report_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(150) NOT NULL,
  "report_type" varchar(50) NOT NULL,
  "format" varchar(20) NOT NULL,
  "filters" jsonb,
  "schedule_expression" varchar(100) NOT NULL,
  "recipients" jsonb NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid,
  "last_run_at" timestamptz,
  "next_run_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "report_runs" (
  "report_run_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "scheduled_report_id" uuid,
  "report_type" varchar(50) NOT NULL,
  "file_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "generated_by_user_id" uuid,
  "generated_at" timestamptz,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "notifications" (
  "notification_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "type" varchar(50) NOT NULL,
  "title" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "entity_type" varchar(50),
  "entity_id" uuid,
  "is_read" boolean NOT NULL DEFAULT false,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "notification_preferences" (
  "notification_preference_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "user_id" uuid NOT NULL,
  "event_type" varchar(50) NOT NULL,
  "in_app_enabled" boolean NOT NULL DEFAULT true,
  "email_enabled" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "notification_deliveries" (
  "notification_delivery_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "notification_id" uuid NOT NULL,
  "channel" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "sent_at" timestamptz,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "audit_logs" (
  "audit_log_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "actor_user_id" uuid,
  "module" varchar(50) NOT NULL,
  "action" varchar(100) NOT NULL,
  "entity_type" varchar(50),
  "entity_id" uuid,
  "before_data" jsonb,
  "after_data" jsonb,
  "ip_address" inet,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "system_settings" (
  "system_setting_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "setting_key" varchar(100) UNIQUE NOT NULL,
  "setting_value" jsonb NOT NULL,
  "updated_by_user_id" uuid,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "workflow_definitions" (
  "workflow_definition_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "name" varchar(150) NOT NULL,
  "entity_type" varchar(50) NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "workflow_steps" (
  "workflow_step_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workflow_definition_id" uuid NOT NULL,
  "step_order" integer NOT NULL,
  "name" varchar(150) NOT NULL,
  "approver_role_id" uuid,
  "required_approvals" integer NOT NULL DEFAULT 1,
  "due_hours" integer
);

CREATE TABLE "approval_requests" (
  "approval_request_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workflow_definition_id" uuid NOT NULL,
  "entity_type" varchar(50) NOT NULL,
  "entity_id" uuid NOT NULL,
  "requested_by_user_id" uuid,
  "current_step" integer NOT NULL DEFAULT 1,
  "status" varchar(30) NOT NULL DEFAULT 'pending',
  "submitted_at" timestamptz NOT NULL DEFAULT (now()),
  "completed_at" timestamptz
);

CREATE TABLE "approval_actions" (
  "approval_action_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "approval_request_id" uuid NOT NULL,
  "workflow_step_id" uuid NOT NULL,
  "acted_by_user_id" uuid,
  "decision" varchar(30) NOT NULL,
  "comment" text,
  "acted_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "approval_delegations" (
  "approval_delegation_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "delegator_user_id" uuid NOT NULL,
  "delegate_user_id" uuid NOT NULL,
  "start_at" timestamptz NOT NULL,
  "end_at" timestamptz NOT NULL,
  "reason" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE INDEX ON "users" ("department_id");

CREATE INDEX ON "login_history" ("user_id", "logged_in_at");

CREATE INDEX ON "assets" ("department_id");

CREATE INDEX ON "assets" ("owner_user_id");

CREATE INDEX ON "risk_assessments" ("asset_id");

CREATE INDEX ON "risk_assessments" ("business_process_id");

CREATE INDEX ON "risk_assessments" ("status", "risk_level");

CREATE INDEX ON "risk_assessments" ("assessed_by_user_id");

CREATE INDEX ON "risk_treatment_plans" ("risk_assessment_id");

CREATE UNIQUE INDEX ON "policy_versions" ("policy_id", "version_number");

CREATE UNIQUE INDEX ON "policy_acknowledgements" ("policy_version_id", "user_id");

CREATE UNIQUE INDEX ON "compliance_frameworks" ("code", "version");

CREATE UNIQUE INDEX ON "compliance_controls" ("compliance_framework_id", "control_code");

CREATE INDEX ON "incidents" ("status", "severity");

CREATE INDEX ON "incidents" ("detected_at");

CREATE INDEX ON "incident_updates" ("incident_id");

CREATE INDEX ON "security_events" ("log_source_id", "event_time");

CREATE INDEX ON "security_events" ("external_event_id");

CREATE INDEX ON "security_events" ("event_type", "event_time");

CREATE UNIQUE INDEX ON "ai_model_versions" ("model_name", "version");

CREATE INDEX ON "ai_alerts" ("security_event_id");

CREATE INDEX ON "ai_alerts" ("log_source_id");

CREATE INDEX ON "ai_alerts" ("asset_id");

CREATE INDEX ON "ai_alerts" ("ai_model_version_id");

CREATE INDEX ON "ai_alerts" ("status", "detected_at");

CREATE UNIQUE INDEX ON "training_campaign_targets" ("training_campaign_id", "user_id");

CREATE UNIQUE INDEX ON "training_campaign_targets" ("training_campaign_id", "department_id");

CREATE UNIQUE INDEX ON "training_enrollments" ("training_campaign_id", "user_id");

CREATE INDEX ON "notifications" ("user_id", "is_read", "created_at");

CREATE UNIQUE INDEX ON "notification_preferences" ("user_id", "event_type");

CREATE INDEX ON "audit_logs" ("actor_user_id", "created_at");

CREATE INDEX ON "audit_logs" ("entity_type", "entity_id");

CREATE UNIQUE INDEX ON "workflow_steps" ("workflow_definition_id", "step_order");

COMMENT ON TABLE "departments" IS 'CHECK (status IN (''active'', ''inactive''))
';

COMMENT ON TABLE "users" IS 'CHECK (status IN (''active'', ''inactive'', ''locked'', ''disabled''))
';

COMMENT ON TABLE "mfa_methods" IS 'CHECK (method_type IN (''totp'', ''email''))
';

COMMENT ON TABLE "import_jobs" IS 'CHECK (import_type IN (''users'', ''assets''))

CHECK (status IN (''pending'', ''processing'', ''completed'', ''failed''))

CHECK (
  total_rows >= 0
  AND success_rows >= 0
  AND failed_rows >= 0
  AND success_rows + failed_rows <= total_rows
)
';

COMMENT ON TABLE "assets" IS 'CHECK (criticality IN (''low'', ''medium'', ''high'', ''critical''))

CHECK (status IN (''active'', ''inactive'', ''retired'', ''disposed''))
';

COMMENT ON TABLE "business_processes" IS 'CHECK (criticality IN (''low'', ''medium'', ''high'', ''critical''))

CHECK (status IN (''active'', ''inactive''))
';

COMMENT ON TABLE "vulnerabilities" IS 'CHECK (
  severity IS NULL
  OR severity IN (''low'', ''medium'', ''high'', ''critical'')
)
';

COMMENT ON TABLE "risk_assessments" IS 'CHECK (likelihood BETWEEN 1 AND 5)

CHECK (impact BETWEEN 1 AND 5)

CHECK (risk_score = likelihood * impact)

CHECK (risk_level IN (''low'', ''medium'', ''high'', ''critical''))

CHECK (
  residual_likelihood IS NULL
  OR residual_likelihood BETWEEN 1 AND 5
)

CHECK (
  residual_impact IS NULL
  OR residual_impact BETWEEN 1 AND 5
)

CHECK (
  residual_score IS NULL
  OR (
    residual_likelihood IS NOT NULL
    AND residual_impact IS NOT NULL
    AND residual_score = residual_likelihood * residual_impact
  )
)

CHECK (
  status IN (
    ''draft'',
    ''pending_approval'',
    ''approved'',
    ''in_treatment'',
    ''closed'',
    ''rejected''
  )
)

CHECK (
  (asset_id IS NOT NULL AND business_process_id IS NULL)
  OR (asset_id IS NULL AND business_process_id IS NOT NULL)
)
';

COMMENT ON COLUMN "risk_assessments"."risk_score" IS 'likelihood x impact';

COMMENT ON TABLE "risk_treatment_plans" IS 'CHECK (
  strategy IN (''avoid'', ''mitigate'', ''transfer'', ''accept'')
)

CHECK (
  status IN (
    ''draft'',
    ''pending_approval'',
    ''approved'',
    ''in_progress'',
    ''completed'',
    ''rejected'',
    ''cancelled''
  )
)

CHECK (
  completed_at IS NULL
  OR completed_at >= created_at
)
';

COMMENT ON TABLE "risk_treatment_actions" IS 'CHECK (progress_percent BETWEEN 0 AND 100)

CHECK (
  status IN (
    ''pending'',
    ''in_progress'',
    ''completed'',
    ''blocked'',
    ''cancelled''
  )
)

CHECK (
  completed_at IS NULL
  OR completed_at >= created_at
)
';

COMMENT ON TABLE "policies" IS 'CHECK (
  status IN (
    ''draft'',
    ''pending_approval'',
    ''published'',
    ''archived''
  )
)
';

COMMENT ON TABLE "policy_versions" IS 'CHECK (
  status IN (
    ''draft'',
    ''pending_review'',
    ''approved'',
    ''published'',
    ''archived''
  )
)

CHECK (
  published_at IS NULL
  OR published_at >= created_at
)
';

COMMENT ON TABLE "control_assessments" IS 'CHECK (
  compliance_status IN (
    ''compliant'',
    ''partially_compliant'',
    ''non_compliant'',
    ''not_assessed''
  )
)

CHECK (
  score IS NULL
  OR score BETWEEN 0 AND 100
)

CHECK (
  next_review_at IS NULL
  OR next_review_at >= assessed_at
)
';

COMMENT ON TABLE "incidents" IS 'CHECK (
  severity IN (''low'', ''medium'', ''high'', ''critical'')
)

CHECK (
  status IN (
    ''reported'',
    ''assigned'',
    ''in_progress'',
    ''escalated'',
    ''resolved'',
    ''closed''
  )
)

CHECK (
  occurred_at IS NULL
  OR occurred_at <= detected_at
)

CHECK (
  resolved_at IS NULL
  OR resolved_at >= detected_at
)

CHECK (
  closed_at IS NULL
  OR (
    resolved_at IS NOT NULL
    AND closed_at >= resolved_at
  )
)
';

COMMENT ON TABLE "incident_assignments" IS 'CHECK (
  (assignee_user_id IS NOT NULL AND assignee_team_id IS NULL)
  OR (assignee_user_id IS NULL AND assignee_team_id IS NOT NULL)
)

CHECK (
  completed_at IS NULL
  OR completed_at >= assigned_at
)
';

COMMENT ON TABLE "incident_updates" IS 'CHECK (
  status_from IS NULL
  OR status_from IN (''reported'', ''assigned'', ''in_progress'', ''escalated'', ''resolved'', ''closed'')
)

CHECK (
  status_to IS NULL
  OR status_to IN (''reported'', ''assigned'', ''in_progress'', ''escalated'', ''resolved'', ''closed'')
)
';

COMMENT ON TABLE "integrations" IS 'CHECK (
  integration_type IN (
    ''siem'',
    ''firewall'',
    ''log_source'',
    ''api''
  )
)

CHECK (
  status IN (
    ''active'',
    ''inactive'',
    ''error'',
    ''disabled''
  )
)
';

COMMENT ON TABLE "sync_jobs" IS 'CHECK (
  status IN (
    ''pending'',
    ''running'',
    ''completed'',
    ''failed'',
    ''cancelled''
  )
)

CHECK (
  records_processed >= 0
  AND records_failed >= 0
)

CHECK (
  completed_at IS NULL
  OR (
    started_at IS NOT NULL
    AND completed_at >= started_at
  )
)
';

COMMENT ON TABLE "log_sources" IS 'CHECK (
  source_type IN (
    ''application'',
    ''system'',
    ''authentication'',
    ''network'',
    ''firewall'',
    ''external''
  )
)

CHECK (
  status IN (''active'', ''inactive'', ''error'')
)
';

COMMENT ON TABLE "security_events" IS 'This entity represents the security event received from a log source and normalized for AI analysis.
It provides traceability between external events and generated AI alerts.

CHECK (
  severity IS NULL
  OR severity IN (''low'', ''medium'', ''high'', ''critical'')
)
';

COMMENT ON TABLE "ai_model_versions" IS 'This table stores pre-trained AI model versions used by the system.
The system does not perform model training, retraining, or fine-tuning.

PostgreSQL partial unique index required:
CREATE UNIQUE INDEX uq_ai_model_versions_one_active
ON ai_model_versions(model_name)
WHERE is_active = true;
';

COMMENT ON TABLE "ai_alerts" IS 'CHECK (anomaly_score BETWEEN 0 AND 1)

CHECK (
  risk_score IS NULL
  OR risk_score BETWEEN 0 AND 100
)

CHECK (
  risk_level IS NULL
  OR risk_level IN (''low'', ''medium'', ''high'', ''critical'')
)

CHECK (
  status IN (
    ''new'',
    ''reviewing'',
    ''confirmed'',
    ''false_positive'',
    ''resolved'',
    ''dismissed''
  )
)

CHECK (
  reviewed_at IS NULL
  OR reviewed_at >= detected_at
)
';

COMMENT ON TABLE "ai_feedback" IS 'CHECK (
  feedback_label IN (
    ''confirmed_incident'',
    ''false_positive'',
    ''needs_review''
  )
)
';

COMMENT ON TABLE "asset_alert_thresholds" IS 'CHECK (threshold BETWEEN 0 AND 1)

CHECK (
  risk_level_min IS NULL
  OR risk_level_min IN (''low'', ''medium'', ''high'', ''critical'')
)
';

COMMENT ON TABLE "training_courses" IS 'CHECK (
  status IN (''draft'', ''published'', ''archived'')
)
';

COMMENT ON TABLE "training_campaigns" IS 'CHECK (due_date >= start_date)
';

COMMENT ON TABLE "training_campaign_targets" IS 'CHECK (
  (user_id IS NOT NULL AND department_id IS NULL)
  OR (user_id IS NULL AND department_id IS NOT NULL)
)
';

COMMENT ON TABLE "training_enrollments" IS 'CHECK (
  status IN (
    ''assigned'',
    ''in_progress'',
    ''completed'',
    ''overdue'',
    ''cancelled''
  )
)

CHECK (progress_percent BETWEEN 0 AND 100)

CHECK (
  completed_at IS NULL
  OR (
    started_at IS NOT NULL
    AND completed_at >= started_at
  )
)
';

COMMENT ON TABLE "quizzes" IS 'CHECK (passing_score BETWEEN 0 AND 100)

CHECK (max_attempts > 0)
';

COMMENT ON TABLE "quiz_questions" IS 'CHECK (
  question_type IN (
    ''single_choice'',
    ''multiple_choice'',
    ''true_false'',
    ''short_answer''
  )
)

CHECK (score >= 0)

CHECK (display_order > 0)
';

COMMENT ON TABLE "quiz_options" IS 'CHECK (display_order > 0)
';

COMMENT ON TABLE "quiz_attempts" IS 'CHECK (
  score IS NULL
  OR score BETWEEN 0 AND 100
)

CHECK (
  submitted_at IS NULL
  OR submitted_at >= started_at
)
';

COMMENT ON TABLE "scheduled_reports" IS 'CHECK (
  report_type IN (
    ''risk'',
    ''compliance'',
    ''incident'',
    ''training'',
    ''security_kpi'',
    ''executive_summary''
  )
)

CHECK (
  format IN (''pdf'', ''excel'')
)
';

COMMENT ON TABLE "report_runs" IS 'CHECK (
  status IN (
    ''pending'',
    ''processing'',
    ''completed'',
    ''failed''
  )
)
';

COMMENT ON TABLE "notification_deliveries" IS 'CHECK (
  channel IN (''in_app'', ''email'')
)

CHECK (
  status IN (
    ''pending'',
    ''sent'',
    ''delivered'',
    ''failed''
  )
)
';

COMMENT ON TABLE "workflow_steps" IS 'CHECK (step_order > 0)

CHECK (required_approvals > 0)

CHECK (
  due_hours IS NULL
  OR due_hours > 0
)
';

COMMENT ON TABLE "approval_requests" IS 'CHECK (current_step > 0)

CHECK (
  status IN (
    ''pending'',
    ''approved'',
    ''rejected'',
    ''cancelled'',
    ''expired''
  )
)

CHECK (
  completed_at IS NULL
  OR completed_at >= submitted_at
)
';

COMMENT ON TABLE "approval_actions" IS 'CHECK (
  decision IN (
    ''approved'',
    ''rejected'',
    ''returned''
  )
)
';

COMMENT ON TABLE "approval_delegations" IS 'CHECK (delegator_user_id <> delegate_user_id)

CHECK (end_at > start_at)
';

ALTER TABLE "departments" ADD FOREIGN KEY ("parent_department_id") REFERENCES "departments" ("department_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "users" ADD FOREIGN KEY ("department_id") REFERENCES "departments" ("department_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "users" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_roles" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_roles" ADD FOREIGN KEY ("role_id") REFERENCES "roles" ("role_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_roles" ADD FOREIGN KEY ("assigned_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "role_permissions" ADD FOREIGN KEY ("role_id") REFERENCES "roles" ("role_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "role_permissions" ADD FOREIGN KEY ("permission_id") REFERENCES "permissions" ("permission_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "auth_sessions" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "mfa_methods" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "password_reset_tokens" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "login_history" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "teams" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "team_members" ADD FOREIGN KEY ("team_id") REFERENCES "teams" ("team_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "team_members" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "files" ADD FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "import_jobs" ADD FOREIGN KEY ("file_id") REFERENCES "files" ("file_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "import_jobs" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "assets" ADD FOREIGN KEY ("department_id") REFERENCES "departments" ("department_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "assets" ADD FOREIGN KEY ("owner_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "assets" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "asset_change_history" ADD FOREIGN KEY ("asset_id") REFERENCES "assets" ("asset_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "asset_change_history" ADD FOREIGN KEY ("changed_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "business_processes" ADD FOREIGN KEY ("department_id") REFERENCES "departments" ("department_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "business_processes" ADD FOREIGN KEY ("owner_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_assessments" ADD FOREIGN KEY ("asset_id") REFERENCES "assets" ("asset_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_assessments" ADD FOREIGN KEY ("business_process_id") REFERENCES "business_processes" ("business_process_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_assessments" ADD FOREIGN KEY ("assessed_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_assessments" ADD FOREIGN KEY ("previous_risk_assessment_id") REFERENCES "risk_assessments" ("risk_assessment_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_assessment_threats" ADD FOREIGN KEY ("risk_assessment_id") REFERENCES "risk_assessments" ("risk_assessment_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_assessment_threats" ADD FOREIGN KEY ("threat_id") REFERENCES "threats" ("threat_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_assessment_vulnerabilities" ADD FOREIGN KEY ("risk_assessment_id") REFERENCES "risk_assessments" ("risk_assessment_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_assessment_vulnerabilities" ADD FOREIGN KEY ("vulnerability_id") REFERENCES "vulnerabilities" ("vulnerability_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_treatment_plans" ADD FOREIGN KEY ("risk_assessment_id") REFERENCES "risk_assessments" ("risk_assessment_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_treatment_plans" ADD FOREIGN KEY ("owner_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_treatment_plans" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_treatment_actions" ADD FOREIGN KEY ("risk_treatment_plan_id") REFERENCES "risk_treatment_plans" ("risk_treatment_plan_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "risk_treatment_actions" ADD FOREIGN KEY ("assigned_to_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policies" ADD FOREIGN KEY ("owner_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policy_versions" ADD FOREIGN KEY ("policy_id") REFERENCES "policies" ("policy_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policy_versions" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policy_versions" ADD FOREIGN KEY ("published_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policy_departments" ADD FOREIGN KEY ("policy_id") REFERENCES "policies" ("policy_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policy_departments" ADD FOREIGN KEY ("department_id") REFERENCES "departments" ("department_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policy_departments" ADD FOREIGN KEY ("assigned_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policy_acknowledgements" ADD FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions" ("policy_version_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policy_acknowledgements" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "compliance_controls" ADD FOREIGN KEY ("compliance_framework_id") REFERENCES "compliance_frameworks" ("compliance_framework_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "compliance_controls" ADD FOREIGN KEY ("parent_compliance_control_id") REFERENCES "compliance_controls" ("compliance_control_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policy_control_mappings" ADD FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions" ("policy_version_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "policy_control_mappings" ADD FOREIGN KEY ("compliance_control_id") REFERENCES "compliance_controls" ("compliance_control_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "control_assessments" ADD FOREIGN KEY ("compliance_control_id") REFERENCES "compliance_controls" ("compliance_control_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "control_assessments" ADD FOREIGN KEY ("assessed_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "compliance_evidence" ADD FOREIGN KEY ("control_assessment_id") REFERENCES "control_assessments" ("control_assessment_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "compliance_evidence" ADD FOREIGN KEY ("file_id") REFERENCES "files" ("file_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "compliance_evidence" ADD FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incidents" ADD FOREIGN KEY ("reported_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_assignments" ADD FOREIGN KEY ("incident_id") REFERENCES "incidents" ("incident_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_assignments" ADD FOREIGN KEY ("assignee_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_assignments" ADD FOREIGN KEY ("assignee_team_id") REFERENCES "teams" ("team_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_assignments" ADD FOREIGN KEY ("assigned_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_updates" ADD FOREIGN KEY ("incident_id") REFERENCES "incidents" ("incident_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_updates" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_evidence" ADD FOREIGN KEY ("incident_id") REFERENCES "incidents" ("incident_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_evidence" ADD FOREIGN KEY ("file_id") REFERENCES "files" ("file_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_evidence" ADD FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_risk_links" ADD FOREIGN KEY ("incident_id") REFERENCES "incidents" ("incident_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_risk_links" ADD FOREIGN KEY ("risk_assessment_id") REFERENCES "risk_assessments" ("risk_assessment_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_risk_links" ADD FOREIGN KEY ("linked_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "post_incident_reports" ADD FOREIGN KEY ("incident_id") REFERENCES "incidents" ("incident_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "post_incident_reports" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "integrations" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "integration_api_keys" ADD FOREIGN KEY ("integration_id") REFERENCES "integrations" ("integration_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sync_schedules" ADD FOREIGN KEY ("integration_id") REFERENCES "integrations" ("integration_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sync_jobs" ADD FOREIGN KEY ("integration_id") REFERENCES "integrations" ("integration_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sync_jobs" ADD FOREIGN KEY ("sync_schedule_id") REFERENCES "sync_schedules" ("sync_schedule_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "integration_logs" ADD FOREIGN KEY ("integration_id") REFERENCES "integrations" ("integration_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "integration_logs" ADD FOREIGN KEY ("sync_job_id") REFERENCES "sync_jobs" ("sync_job_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "log_sources" ADD FOREIGN KEY ("asset_id") REFERENCES "assets" ("asset_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "log_sources" ADD FOREIGN KEY ("integration_id") REFERENCES "integrations" ("integration_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "log_sources" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "security_events" ADD FOREIGN KEY ("log_source_id") REFERENCES "log_sources" ("log_source_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ai_alerts" ADD FOREIGN KEY ("security_event_id") REFERENCES "security_events" ("security_event_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ai_alerts" ADD FOREIGN KEY ("log_source_id") REFERENCES "log_sources" ("log_source_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ai_alerts" ADD FOREIGN KEY ("asset_id") REFERENCES "assets" ("asset_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ai_alerts" ADD FOREIGN KEY ("ai_model_version_id") REFERENCES "ai_model_versions" ("ai_model_version_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ai_alerts" ADD FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ai_alert_explanations" ADD FOREIGN KEY ("ai_alert_id") REFERENCES "ai_alerts" ("ai_alert_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ai_feedback" ADD FOREIGN KEY ("ai_alert_id") REFERENCES "ai_alerts" ("ai_alert_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ai_feedback" ADD FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "asset_alert_thresholds" ADD FOREIGN KEY ("asset_id") REFERENCES "assets" ("asset_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "asset_alert_thresholds" ADD FOREIGN KEY ("updated_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_alert_links" ADD FOREIGN KEY ("incident_id") REFERENCES "incidents" ("incident_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_alert_links" ADD FOREIGN KEY ("ai_alert_id") REFERENCES "ai_alerts" ("ai_alert_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "incident_alert_links" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_courses" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_campaigns" ADD FOREIGN KEY ("training_course_id") REFERENCES "training_courses" ("training_course_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_campaigns" ADD FOREIGN KEY ("assigned_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_campaign_targets" ADD FOREIGN KEY ("training_campaign_id") REFERENCES "training_campaigns" ("training_campaign_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_campaign_targets" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_campaign_targets" ADD FOREIGN KEY ("department_id") REFERENCES "departments" ("department_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_enrollments" ADD FOREIGN KEY ("training_campaign_id") REFERENCES "training_campaigns" ("training_campaign_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_enrollments" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "quizzes" ADD FOREIGN KEY ("training_course_id") REFERENCES "training_courses" ("training_course_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "quiz_questions" ADD FOREIGN KEY ("quiz_id") REFERENCES "quizzes" ("quiz_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "quiz_options" ADD FOREIGN KEY ("quiz_question_id") REFERENCES "quiz_questions" ("quiz_question_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "quiz_attempts" ADD FOREIGN KEY ("quiz_id") REFERENCES "quizzes" ("quiz_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "quiz_attempts" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "quiz_answers" ADD FOREIGN KEY ("quiz_attempt_id") REFERENCES "quiz_attempts" ("quiz_attempt_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "quiz_answers" ADD FOREIGN KEY ("quiz_question_id") REFERENCES "quiz_questions" ("quiz_question_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "quiz_answers" ADD FOREIGN KEY ("selected_quiz_option_id") REFERENCES "quiz_options" ("quiz_option_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_certificates" ADD FOREIGN KEY ("training_enrollment_id") REFERENCES "training_enrollments" ("training_enrollment_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_certificates" ADD FOREIGN KEY ("file_id") REFERENCES "files" ("file_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "training_certificates" ADD FOREIGN KEY ("issued_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "dashboard_preferences" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "scheduled_reports" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "report_runs" ADD FOREIGN KEY ("scheduled_report_id") REFERENCES "scheduled_reports" ("scheduled_report_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "report_runs" ADD FOREIGN KEY ("file_id") REFERENCES "files" ("file_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "report_runs" ADD FOREIGN KEY ("generated_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "notifications" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "notification_preferences" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "notification_deliveries" ADD FOREIGN KEY ("notification_id") REFERENCES "notifications" ("notification_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "audit_logs" ADD FOREIGN KEY ("actor_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "system_settings" ADD FOREIGN KEY ("updated_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workflow_definitions" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workflow_steps" ADD FOREIGN KEY ("workflow_definition_id") REFERENCES "workflow_definitions" ("workflow_definition_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workflow_steps" ADD FOREIGN KEY ("approver_role_id") REFERENCES "roles" ("role_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "approval_requests" ADD FOREIGN KEY ("workflow_definition_id") REFERENCES "workflow_definitions" ("workflow_definition_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "approval_requests" ADD FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "approval_actions" ADD FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests" ("approval_request_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "approval_actions" ADD FOREIGN KEY ("workflow_step_id") REFERENCES "workflow_steps" ("workflow_step_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "approval_actions" ADD FOREIGN KEY ("acted_by_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "approval_delegations" ADD FOREIGN KEY ("delegator_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "approval_delegations" ADD FOREIGN KEY ("delegate_user_id") REFERENCES "users" ("user_id") DEFERRABLE INITIALLY IMMEDIATE;


