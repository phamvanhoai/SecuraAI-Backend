-- ============================================================
-- SecuraAI - PostgreSQL Database Baseline V2.1
-- Fresh-install schema
-- Core workflow:
-- Asset -> Risk -> Control -> Event -> AI/XAI
-- -> Alert Triage -> Security Finding -> Incident
-- -> Control Weakness -> Risk Reassessment
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM ('ADMIN','SECURITY_OFFICER','EMPLOYEE','EXECUTIVE');
CREATE TYPE user_status AS ENUM ('ACTIVE','INACTIVE','LOCKED');
CREATE TYPE asset_status AS ENUM ('ACTIVE','ARCHIVED');
CREATE TYPE risk_status AS ENUM ('OPEN','UNDER_TREATMENT','ACCEPTED','CLOSED','ARCHIVED');
CREATE TYPE risk_rating AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE risk_assessment_type AS ENUM ('INITIAL','PERIODIC_REVIEW','INCIDENT_REASSESSMENT');
CREATE TYPE treatment_strategy AS ENUM ('MITIGATE','ACCEPT','TRANSFER','AVOID');
CREATE TYPE treatment_status AS ENUM ('DRAFT','ACTIVE','COMPLETED','CANCELLED');
CREATE TYPE treatment_action_status AS ENUM ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED');
CREATE TYPE acceptance_decision AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE control_applicability AS ENUM ('APPLICABLE','NOT_APPLICABLE','UNDER_REVIEW');
CREATE TYPE control_implementation_status AS ENUM ('NOT_IMPLEMENTED','PLANNED','PARTIALLY_IMPLEMENTED','IMPLEMENTED');
CREATE TYPE control_finding_type AS ENUM ('CONTROL_WEAKNESS','NONCONFORMITY','OBSERVATION','IMPROVEMENT');
CREATE TYPE finding_status AS ENUM ('OPEN','UNDER_REVIEW','RESOLVED','CLOSED');
CREATE TYPE evidence_status AS ENUM ('ACTIVE','EXPIRED','INVALID','ARCHIVED');
CREATE TYPE event_source_status AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE event_schema_status AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE ingestion_method AS ENUM ('API','FILE');
CREATE TYPE event_family AS ENUM ('AUTHENTICATION','VPN_SSO','APPLICATION_ACCESS');
CREATE TYPE mapping_status AS ENUM ('UNMAPPED','PARTIALLY_MAPPED','MAPPED','NEEDS_REVIEW');
CREATE TYPE mapping_method AS ENUM ('AUTO','MANUAL');
CREATE TYPE ingestion_batch_status AS ENUM ('PENDING','PROCESSING','COMPLETED','PARTIALLY_COMPLETED','FAILED');
CREATE TYPE model_status AS ENUM ('DEVELOPMENT','EVALUATED','DEPLOYED','RETIRED');
CREATE TYPE alert_status AS ENUM ('NEW','IN_TRIAGE','NEED_INVESTIGATION','DISMISSED','CONFIRMED');
CREATE TYPE triage_decision AS ENUM ('VALID_ANOMALY','FALSE_POSITIVE','NEED_INVESTIGATION');
CREATE TYPE security_finding_status AS ENUM ('OPEN','CONFIRMED','DISMISSED','CONVERTED_TO_INCIDENT');
CREATE TYPE incident_status AS ENUM ('OPEN','TRIAGE','CONTAINMENT','ERADICATION','RECOVERY','LESSONS_LEARNED','CLOSED');
CREATE TYPE incident_phase AS ENUM ('CONTAINMENT','ERADICATION','RECOVERY');
CREATE TYPE reassessment_status AS ENUM ('PENDING','UNDER_REVIEW','COMPLETED','REJECTED');
CREATE TYPE api_key_status AS ENUM ('ACTIVE','EXPIRED','REVOKED','ROTATED');
CREATE TYPE governance_policy_status AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE report_export_status AS ENUM ('REQUESTED','GENERATING','COMPLETED','FAILED');
CREATE TYPE policy_status AS ENUM ('DRAFT','ACTIVE','ARCHIVED');
CREATE TYPE policy_version_status AS ENUM ('DRAFT','IN_REVIEW','WAITING_APPROVAL','APPROVED','REJECTED','PUBLISHED','SUPERSEDED');
CREATE TYPE policy_decision_action AS ENUM ('REVIEWED','REVISION_REQUESTED','APPROVED','REJECTED');
CREATE TYPE audit_actor_type AS ENUM ('USER','SYSTEM','API_KEY');

-- ============================================================
-- 1. AUTHENTICATION & AUTHORIZATION
-- ============================================================

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) NOT NULL UNIQUE,
    username varchar(100) NOT NULL UNIQUE,
    password_hash varchar(255) NOT NULL,
    full_name varchar(255) NOT NULL,
    role user_role NOT NULL,
    status user_status NOT NULL DEFAULT 'ACTIVE',
    last_login_at timestamptz,
    password_changed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_user_email CHECK (char_length(trim(email)) > 0),
    CONSTRAINT chk_user_username CHECK (char_length(trim(username)) > 0),
    CONSTRAINT chk_user_full_name CHECK (char_length(trim(full_name)) > 0),
    CONSTRAINT chk_user_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    refresh_token_hash varchar(255) NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_auth_session_expiration CHECK (expires_at > created_at),
    CONSTRAINT chk_auth_session_revoked_time CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE password_reset_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    token_hash varchar(255) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_password_reset_expiration CHECK (expires_at > created_at),
    CONSTRAINT chk_password_reset_used_time CHECK (used_at IS NULL OR used_at >= created_at)
);

-- ============================================================
-- 2. ASSET MANAGEMENT
-- ============================================================

CREATE TABLE business_services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    description text,
    owner_user_id uuid,
    status varchar(50) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_business_service_name CHECK (char_length(trim(name)) > 0),
    CONSTRAINT chk_business_service_status CHECK (status IN ('ACTIVE','INACTIVE')),
    CONSTRAINT chk_business_service_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_code varchar(100) NOT NULL UNIQUE,
    name varchar(255) NOT NULL,
    asset_type varchar(100) NOT NULL,
    owner_user_id uuid,
    business_service_id uuid,
    criticality varchar(50) NOT NULL,
    data_classification varchar(50) NOT NULL,
    description text,
    status asset_status NOT NULL DEFAULT 'ACTIVE',
    archived_at timestamptz,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_asset_code CHECK (char_length(trim(asset_code)) > 0),
    CONSTRAINT chk_asset_name CHECK (char_length(trim(name)) > 0),
    CONSTRAINT chk_asset_updated_time CHECK (updated_at >= created_at),
    CONSTRAINT chk_asset_archive_state CHECK (
        (status = 'ACTIVE' AND archived_at IS NULL)
        OR (status = 'ARCHIVED' AND archived_at IS NOT NULL)
    )
);

CREATE TABLE asset_dependencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id uuid NOT NULL,
    depends_on_asset_id uuid NOT NULL,
    dependency_type varchar(100),
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_asset_dependency UNIQUE (asset_id, depends_on_asset_id),
    CONSTRAINT chk_asset_no_self_dependency CHECK (asset_id <> depends_on_asset_id)
);

CREATE TABLE user_access_scopes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    scope_code varchar(100) NOT NULL,
    business_service_id uuid,
    asset_id uuid,
    assigned_by uuid NOT NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    CONSTRAINT chk_access_scope_code CHECK (char_length(trim(scope_code)) > 0),
    CONSTRAINT chk_access_scope_single_target CHECK (num_nonnulls(business_service_id, asset_id) <= 1),
    CONSTRAINT chk_access_scope_expiration CHECK (expires_at IS NULL OR expires_at > assigned_at)
);

-- ============================================================
-- 3. RISK MANAGEMENT
-- ============================================================

CREATE TABLE risks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    risk_code varchar(100) NOT NULL UNIQUE,
    title varchar(255) NOT NULL,
    description text,
    owner_user_id uuid,
    status risk_status NOT NULL DEFAULT 'OPEN',
    review_date date,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_risk_code CHECK (char_length(trim(risk_code)) > 0),
    CONSTRAINT chk_risk_title CHECK (char_length(trim(title)) > 0),
    CONSTRAINT chk_risk_review_date CHECK (review_date IS NULL OR review_date >= created_at::date),
    CONSTRAINT chk_risk_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE risk_assets (
    risk_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    linked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (risk_id, asset_id)
);

CREATE TABLE risk_threats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    risk_id uuid NOT NULL,
    name varchar(255) NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_risk_threat_name CHECK (char_length(trim(name)) > 0)
);

CREATE TABLE risk_vulnerabilities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    risk_id uuid NOT NULL,
    name varchar(255) NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_risk_vulnerability_name CHECK (char_length(trim(name)) > 0)
);

-- Created before referenced incident/control finding tables; FKs added later.
CREATE TABLE risk_reassessment_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id uuid NOT NULL,
    risk_id uuid NOT NULL,
    control_finding_id uuid,
    requested_by uuid NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    reason text NOT NULL,
    status reassessment_status NOT NULL DEFAULT 'PENDING',
    reviewed_by uuid,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_reassessment_reason CHECK (char_length(trim(reason)) > 0),
    CONSTRAINT chk_reassessment_review_state CHECK (
        (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL)
        OR (status = 'UNDER_REVIEW' AND reviewed_by IS NOT NULL)
        OR (status IN ('COMPLETED','REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT chk_reassessment_review_time CHECK (reviewed_at IS NULL OR reviewed_at >= requested_at),
    CONSTRAINT chk_reassessment_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE risk_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    risk_id uuid NOT NULL,
    assessment_type risk_assessment_type NOT NULL,
    inherent_likelihood int,
    inherent_impact int,
    inherent_rating risk_rating,
    control_effectiveness numeric(5,2),
    residual_likelihood int,
    residual_impact int,
    residual_rating risk_rating,
    target_risk risk_rating,
    risk_appetite risk_rating,
    risk_tolerance risk_rating,
    assessment_reason text,
    assessed_by uuid NOT NULL,
    assessed_at timestamptz NOT NULL DEFAULT now(),
    review_date date,
    reassessment_request_id uuid UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_inherent_likelihood_range CHECK (inherent_likelihood IS NULL OR inherent_likelihood BETWEEN 1 AND 5),
    CONSTRAINT chk_inherent_impact_range CHECK (inherent_impact IS NULL OR inherent_impact BETWEEN 1 AND 5),
    CONSTRAINT chk_residual_likelihood_range CHECK (residual_likelihood IS NULL OR residual_likelihood BETWEEN 1 AND 5),
    CONSTRAINT chk_residual_impact_range CHECK (residual_impact IS NULL OR residual_impact BETWEEN 1 AND 5),
    CONSTRAINT chk_risk_control_effectiveness CHECK (control_effectiveness IS NULL OR control_effectiveness BETWEEN 0 AND 100),
    CONSTRAINT chk_assessment_review_date CHECK (review_date IS NULL OR review_date >= assessed_at::date),
    CONSTRAINT chk_incident_reassessment_request CHECK (assessment_type <> 'INCIDENT_REASSESSMENT' OR reassessment_request_id IS NOT NULL)
);

CREATE TABLE risk_treatment_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    risk_id uuid NOT NULL,
    source_assessment_id uuid,
    title varchar(255) NOT NULL,
    strategy treatment_strategy NOT NULL,
    status treatment_status NOT NULL DEFAULT 'DRAFT',
    owner_user_id uuid,
    target_completion_date date,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_treatment_plan_title CHECK (char_length(trim(title)) > 0),
    CONSTRAINT chk_treatment_target_date CHECK (target_completion_date IS NULL OR target_completion_date >= created_at::date),
    CONSTRAINT chk_treatment_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE risk_treatment_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_plan_id uuid NOT NULL,
    action_description text NOT NULL,
    owner_user_id uuid,
    status treatment_action_status NOT NULL DEFAULT 'PENDING',
    due_date date,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_treatment_action_description CHECK (char_length(trim(action_description)) > 0),
    CONSTRAINT chk_treatment_action_due_date CHECK (due_date IS NULL OR due_date >= created_at::date),
    CONSTRAINT chk_treatment_action_completed_time CHECK (completed_at IS NULL OR completed_at >= created_at),
    CONSTRAINT chk_completed_action_timestamp CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL),
    CONSTRAINT chk_treatment_action_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE risk_acceptances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    risk_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    decision acceptance_decision NOT NULL DEFAULT 'PENDING',
    decided_by uuid,
    decided_at timestamptz,
    reason text,
    valid_until date,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_risk_acceptance_decision CHECK (
        (decision = 'PENDING' AND decided_by IS NULL AND decided_at IS NULL)
        OR (decision IN ('APPROVED','REJECTED') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    ),
    CONSTRAINT chk_risk_acceptance_decision_time CHECK (decided_at IS NULL OR decided_at >= requested_at),
    CONSTRAINT chk_risk_acceptance_valid_until CHECK (valid_until IS NULL OR decided_at IS NULL OR valid_until >= decided_at::date)
);

-- ============================================================
-- 4. CONTROL & EVIDENCE MANAGEMENT
-- ============================================================

CREATE TABLE security_controls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    control_code varchar(100) NOT NULL UNIQUE,
    name varchar(255) NOT NULL,
    description text,
    owner_user_id uuid,
    applicability control_applicability NOT NULL,
    implementation_status control_implementation_status NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_control_code CHECK (char_length(trim(control_code)) > 0),
    CONSTRAINT chk_control_name CHECK (char_length(trim(name)) > 0),
    CONSTRAINT chk_control_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE control_risk_links (
    control_id uuid NOT NULL,
    risk_id uuid NOT NULL,
    linked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (control_id, risk_id)
);

CREATE TABLE control_asset_links (
    control_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    linked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (control_id, asset_id)
);

CREATE TABLE control_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    control_id uuid NOT NULL,
    assessment_type varchar(100),
    test_method text,
    result varchar(100),
    effectiveness numeric(5,2),
    notes text,
    assessed_by uuid NOT NULL,
    assessed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_control_effectiveness_range CHECK (effectiveness IS NULL OR effectiveness BETWEEN 0 AND 100)
);

-- Incident FK added after incidents table exists.
CREATE TABLE control_findings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    control_id uuid NOT NULL,
    finding_type control_finding_type NOT NULL,
    severity varchar(50),
    description text NOT NULL,
    source varchar(100) NOT NULL,
    incident_id uuid,
    status finding_status NOT NULL DEFAULT 'OPEN',
    identified_by uuid NOT NULL,
    identified_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_control_finding_description CHECK (char_length(trim(description)) > 0),
    CONSTRAINT chk_control_finding_source CHECK (source IN ('CONTROL_TEST','INCIDENT','MANUAL_REVIEW')),
    CONSTRAINT chk_incident_finding_requires_incident CHECK (source <> 'INCIDENT' OR incident_id IS NOT NULL),
    CONSTRAINT chk_control_finding_resolution_time CHECK (resolved_at IS NULL OR resolved_at >= identified_at),
    CONSTRAINT chk_control_finding_resolved_state CHECK (status NOT IN ('RESOLVED','CLOSED') OR resolved_at IS NOT NULL)
);

CREATE TABLE evidence_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    description text,
    source varchar(255) NOT NULL,
    owner_user_id uuid,
    storage_uri text,
    mime_type varchar(100),
    file_size bigint,
    collected_at timestamptz NOT NULL DEFAULT now(),
    valid_from timestamptz,
    valid_until timestamptz,
    status evidence_status NOT NULL DEFAULT 'ACTIVE',
    integrity_hash varchar(255),
    reviewed_by uuid,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_evidence_name CHECK (char_length(trim(name)) > 0),
    CONSTRAINT chk_evidence_source CHECK (char_length(trim(source)) > 0),
    CONSTRAINT chk_evidence_validity_period CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT chk_evidence_reviewer CHECK (reviewed_at IS NULL OR reviewed_by IS NOT NULL),
    CONSTRAINT chk_evidence_review_time CHECK (reviewed_at IS NULL OR reviewed_at >= collected_at),
    CONSTRAINT chk_evidence_file_size CHECK (file_size IS NULL OR file_size >= 0)
);

CREATE TABLE control_evidence_links (
    control_id uuid NOT NULL,
    evidence_id uuid NOT NULL,
    linked_by uuid NOT NULL,
    linked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (control_id, evidence_id)
);

-- ============================================================
-- 5. EVENT INGESTION
-- ============================================================

CREATE TABLE event_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    source_type varchar(100) NOT NULL,
    endpoint text,
    ingestion_method ingestion_method NOT NULL,
    authentication_type varchar(100),
    status event_source_status NOT NULL DEFAULT 'ACTIVE',
    description text,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_event_source_name CHECK (char_length(trim(name)) > 0),
    CONSTRAINT chk_api_event_source_endpoint CHECK (ingestion_method <> 'API' OR endpoint IS NOT NULL),
    CONSTRAINT chk_event_source_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE event_source_families (
    event_source_id uuid NOT NULL,
    event_family event_family NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_source_id, event_family)
);

CREATE TABLE asset_event_sources (
    asset_id uuid NOT NULL,
    event_source_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (asset_id, event_source_id)
);

CREATE TABLE event_schemas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_source_id uuid NOT NULL,
    event_family event_family NOT NULL,
    schema_version varchar(50) NOT NULL,
    schema_definition jsonb NOT NULL,
    status event_schema_status NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_event_schema UNIQUE (event_source_id, event_family, schema_version),
    CONSTRAINT chk_event_schema_version CHECK (char_length(trim(schema_version)) > 0),
    CONSTRAINT chk_event_schema_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE event_ingestion_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_source_id uuid NOT NULL,
    ingestion_method ingestion_method NOT NULL,
    event_family event_family,
    file_name varchar(255),
    file_format varchar(50),
    total_records int NOT NULL DEFAULT 0,
    accepted_records int NOT NULL DEFAULT 0,
    rejected_records int NOT NULL DEFAULT 0,
    status ingestion_batch_status NOT NULL DEFAULT 'PENDING',
    started_at timestamptz,
    completed_at timestamptz,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_batch_total_records CHECK (total_records >= 0),
    CONSTRAINT chk_batch_accepted_records CHECK (accepted_records >= 0),
    CONSTRAINT chk_batch_rejected_records CHECK (rejected_records >= 0),
    CONSTRAINT chk_batch_record_counts CHECK (accepted_records + rejected_records <= total_records),
    CONSTRAINT chk_file_ingestion_metadata CHECK (ingestion_method <> 'FILE' OR (file_name IS NOT NULL AND file_format IS NOT NULL)),
    CONSTRAINT chk_batch_processing_time CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
    CONSTRAINT chk_finished_batch_time CHECK (status NOT IN ('COMPLETED','PARTIALLY_COMPLETED','FAILED') OR completed_at IS NOT NULL)
);

CREATE TABLE monitored_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_identifier varchar(255) NOT NULL,
    display_name varchar(255),
    account_type varchar(100),
    source_system varchar(255) NOT NULL,
    asset_id uuid,
    linked_user_id uuid,
    status varchar(50) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_monitored_account UNIQUE (account_identifier, source_system),
    CONSTRAINT chk_monitored_account_identifier CHECK (char_length(trim(account_identifier)) > 0),
    CONSTRAINT chk_monitored_account_source CHECK (char_length(trim(source_system)) > 0),
    CONSTRAINT chk_monitored_account_status CHECK (status IN ('ACTIVE','INACTIVE')),
    CONSTRAINT chk_monitored_account_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE normalized_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_source_id uuid NOT NULL,
    ingestion_batch_id uuid,
    external_event_id varchar(255),
    event_family event_family NOT NULL,
    event_type varchar(150) NOT NULL,
    schema_version varchar(50),
    occurred_at timestamptz NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT now(),
    account_identifier varchar(255),
    source_ip varchar(45),
    destination_ip varchar(45),
    device_identifier varchar(255),
    severity varchar(50),
    mapping_status mapping_status NOT NULL DEFAULT 'UNMAPPED',
    normalized_payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_normalized_event_external UNIQUE (event_source_id, external_event_id),
    CONSTRAINT chk_normalized_event_type CHECK (char_length(trim(event_type)) > 0),
    CONSTRAINT chk_event_ingestion_time CHECK (ingested_at >= occurred_at)
);

CREATE TABLE invalid_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_source_id uuid NOT NULL,
    ingestion_batch_id uuid,
    event_family event_family,
    record_index int,
    error_code varchar(100),
    error_message text NOT NULL,
    received_payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_invalid_event_record_index CHECK (record_index IS NULL OR record_index >= 0),
    CONSTRAINT chk_invalid_event_error_message CHECK (char_length(trim(error_message)) > 0)
);

CREATE TABLE event_entity_mappings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL,
    user_id uuid,
    monitored_account_id uuid,
    asset_id uuid,
    mapping_method mapping_method NOT NULL,
    confidence numeric(5,4),
    reason text,
    mapped_by uuid,
    mapped_at timestamptz NOT NULL DEFAULT now(),
    is_active boolean NOT NULL DEFAULT true,
    supersedes_mapping_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_event_mapping_single_entity CHECK (num_nonnulls(user_id, monitored_account_id, asset_id) = 1),
    CONSTRAINT chk_event_mapping_confidence CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CONSTRAINT chk_manual_mapping_actor CHECK (mapping_method <> 'MANUAL' OR mapped_by IS NOT NULL),
    CONSTRAINT chk_mapping_no_self_supersede CHECK (supersedes_mapping_id IS NULL OR supersedes_mapping_id <> id)
);

-- ============================================================
-- 6. AI ANOMALY DETECTION & XAI
-- ============================================================

CREATE TABLE ai_datasets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    version varchar(100) NOT NULL,
    source text NOT NULL,
    license_or_usage_rights text,
    ground_truth_description text,
    privacy_notes text,
    limitations text,
    train_split numeric(5,2),
    validation_split numeric(5,2),
    test_split numeric(5,2),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_ai_dataset UNIQUE (name, version),
    CONSTRAINT chk_dataset_name CHECK (char_length(trim(name)) > 0),
    CONSTRAINT chk_dataset_version CHECK (char_length(trim(version)) > 0),
    CONSTRAINT chk_dataset_train_split CHECK (train_split IS NULL OR train_split BETWEEN 0 AND 100),
    CONSTRAINT chk_dataset_validation_split CHECK (validation_split IS NULL OR validation_split BETWEEN 0 AND 100),
    CONSTRAINT chk_dataset_test_split CHECK (test_split IS NULL OR test_split BETWEEN 0 AND 100),
    CONSTRAINT chk_dataset_split_total CHECK (
        train_split IS NULL OR validation_split IS NULL OR test_split IS NULL
        OR train_split + validation_split + test_split = 100
    )
);

CREATE TABLE ai_model_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name varchar(255) NOT NULL,
    model_type varchar(100) NOT NULL,
    version varchar(100) NOT NULL,
    dataset_id uuid,
    feature_definition jsonb,
    parameters jsonb,
    status model_status NOT NULL DEFAULT 'DEVELOPMENT',
    deployed_at timestamptz,
    retired_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_ai_model_version UNIQUE (model_name, version),
    CONSTRAINT chk_model_name CHECK (char_length(trim(model_name)) > 0),
    CONSTRAINT chk_model_version CHECK (char_length(trim(version)) > 0),
    CONSTRAINT chk_model_deployment_time CHECK (deployed_at IS NULL OR deployed_at >= created_at),
    CONSTRAINT chk_model_retirement_time CHECK (retired_at IS NULL OR deployed_at IS NULL OR retired_at >= deployed_at),
    CONSTRAINT chk_deployed_model_timestamp CHECK (status <> 'DEPLOYED' OR deployed_at IS NOT NULL),
    CONSTRAINT chk_retired_model_timestamp CHECK (status <> 'RETIRED' OR retired_at IS NOT NULL)
);

CREATE TABLE ai_model_evaluations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_version_id uuid NOT NULL,
    precision numeric(8,6),
    recall numeric(8,6),
    f1_score numeric(8,6),
    pr_auc numeric(8,6),
    false_positive_rate numeric(8,6),
    alerts_per_day numeric(12,2),
    detection_latency_ms numeric(12,2),
    evaluation_notes text,
    evaluated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_ai_precision CHECK (precision IS NULL OR precision BETWEEN 0 AND 1),
    CONSTRAINT chk_ai_recall CHECK (recall IS NULL OR recall BETWEEN 0 AND 1),
    CONSTRAINT chk_ai_f1 CHECK (f1_score IS NULL OR f1_score BETWEEN 0 AND 1),
    CONSTRAINT chk_ai_pr_auc CHECK (pr_auc IS NULL OR pr_auc BETWEEN 0 AND 1),
    CONSTRAINT chk_ai_false_positive_rate CHECK (false_positive_rate IS NULL OR false_positive_rate BETWEEN 0 AND 1),
    CONSTRAINT chk_ai_alerts_per_day CHECK (alerts_per_day IS NULL OR alerts_per_day >= 0),
    CONSTRAINT chk_ai_detection_latency CHECK (detection_latency_ms IS NULL OR detection_latency_ms >= 0)
);

CREATE TABLE anomaly_detections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL,
    model_version_id uuid NOT NULL,
    anomaly_score numeric(10,8) NOT NULL,
    threshold numeric(10,8) NOT NULL,
    is_anomaly boolean NOT NULL,
    detected_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_anomaly_detection_event_model UNIQUE (event_id, model_version_id),
    CONSTRAINT chk_anomaly_score_range CHECK (anomaly_score BETWEEN 0 AND 1),
    CONSTRAINT chk_anomaly_threshold_range CHECK (threshold BETWEEN 0 AND 1),
    CONSTRAINT chk_anomaly_threshold_decision CHECK (is_anomaly = (anomaly_score >= threshold))
);

CREATE TABLE anomaly_feature_contributions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    detection_id uuid NOT NULL,
    feature_name varchar(255) NOT NULL,
    feature_value text,
    contribution_score numeric(10,8),
    rank int,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_feature_name CHECK (char_length(trim(feature_name)) > 0),
    CONSTRAINT chk_feature_contribution_rank CHECK (rank IS NULL OR rank > 0)
);

CREATE TABLE anomaly_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    detection_id uuid NOT NULL UNIQUE,
    severity varchar(50),
    status alert_status NOT NULL DEFAULT 'NEW',
    assigned_to uuid,
    generated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_anomaly_alert_updated_time CHECK (updated_at >= created_at)
);

-- ============================================================
-- 7. ALERT TRIAGE & ANALYST FEEDBACK
-- ============================================================

CREATE TABLE alert_triage_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id uuid NOT NULL,
    analyst_user_id uuid NOT NULL,
    decision triage_decision NOT NULL,
    reason text NOT NULL,
    model_version_id uuid NOT NULL,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_triage_reason CHECK (char_length(trim(reason)) > 0),
    CONSTRAINT chk_triage_processing_time CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE security_findings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id uuid NOT NULL UNIQUE,
    triage_record_id uuid,
    title varchar(255) NOT NULL,
    description text,
    severity varchar(50),
    status security_finding_status NOT NULL DEFAULT 'OPEN',
    identified_by uuid NOT NULL,
    identified_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_security_finding_title CHECK (char_length(trim(title)) > 0),
    CONSTRAINT chk_security_finding_updated_time CHECK (updated_at >= created_at)
);

-- ============================================================
-- 8. INCIDENT MANAGEMENT
-- ============================================================

CREATE TABLE incidents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_code varchar(100) NOT NULL UNIQUE,
    finding_id uuid UNIQUE,
    title varchar(255) NOT NULL,
    description text,
    severity varchar(50) NOT NULL,
    status incident_status NOT NULL DEFAULT 'OPEN',
    handler_user_id uuid,
    detected_at timestamptz,
    confirmed_at timestamptz,
    closed_at timestamptz,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_incident_code CHECK (char_length(trim(incident_code)) > 0),
    CONSTRAINT chk_incident_title CHECK (char_length(trim(title)) > 0),
    CONSTRAINT chk_incident_confirmation_time CHECK (confirmed_at IS NULL OR detected_at IS NULL OR confirmed_at >= detected_at),
    CONSTRAINT chk_incident_closed_time CHECK (closed_at IS NULL OR confirmed_at IS NULL OR closed_at >= confirmed_at),
    CONSTRAINT chk_closed_incident_timestamp CHECK (status <> 'CLOSED' OR closed_at IS NOT NULL),
    CONSTRAINT chk_incident_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE incident_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id uuid NOT NULL,
    phase incident_phase NOT NULL,
    description text NOT NULL,
    performed_by uuid NOT NULL,
    performed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_incident_action_description CHECK (char_length(trim(description)) > 0)
);

CREATE TABLE incident_analysis (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id uuid NOT NULL UNIQUE,
    root_cause text,
    lessons_learned text,
    improvement_actions text,
    analyzed_by uuid NOT NULL,
    analyzed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_incident_analysis_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE incident_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id uuid NOT NULL,
    normalized_event_id uuid,
    source varchar(255) NOT NULL,
    event_timestamp timestamptz,
    ingestion_timestamp timestamptz,
    timezone varchar(100),
    storage_uri text,
    mime_type varchar(100),
    integrity_hash varchar(255) NOT NULL,
    registered_by uuid NOT NULL,
    registered_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_incident_evidence_source CHECK (normalized_event_id IS NOT NULL OR storage_uri IS NOT NULL),
    CONSTRAINT chk_incident_evidence_timestamp CHECK (ingestion_timestamp IS NULL OR event_timestamp IS NULL OR ingestion_timestamp >= event_timestamp),
    CONSTRAINT chk_incident_evidence_hash CHECK (char_length(trim(integrity_hash)) > 0),
    CONSTRAINT chk_incident_evidence_source_name CHECK (char_length(trim(source)) > 0)
);

-- ============================================================
-- 9. INCIDENT LINKS
-- ============================================================

CREATE TABLE incident_assets (
    incident_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    linked_by uuid NOT NULL,
    linked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (incident_id, asset_id)
);

CREATE TABLE incident_controls (
    incident_id uuid NOT NULL,
    control_id uuid NOT NULL,
    linked_by uuid NOT NULL,
    linked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (incident_id, control_id)
);

CREATE TABLE incident_risks (
    incident_id uuid NOT NULL,
    risk_id uuid NOT NULL,
    linked_by uuid NOT NULL,
    linked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (incident_id, risk_id)
);

-- ============================================================
-- 10. AUDIT, SECURITY & REPORTING
-- ============================================================

CREATE TABLE integration_api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_source_id uuid,
    name varchar(255) NOT NULL,
    key_prefix varchar(50) NOT NULL UNIQUE,
    secret_hash varchar(255) NOT NULL,
    status api_key_status NOT NULL DEFAULT 'ACTIVE',
    expires_at timestamptz,
    last_used_at timestamptz,
    last_used_ip varchar(45),
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    rotated_at timestamptz,
    revoked_by uuid,
    revoked_at timestamptz,
    replacement_key_id uuid,
    CONSTRAINT chk_api_key_name CHECK (char_length(trim(name)) > 0),
    CONSTRAINT chk_api_key_prefix CHECK (char_length(trim(key_prefix)) > 0),
    CONSTRAINT chk_api_key_secret_hash CHECK (char_length(trim(secret_hash)) > 0),
    CONSTRAINT chk_api_key_expiration CHECK (expires_at IS NULL OR expires_at > created_at),
    CONSTRAINT chk_api_key_last_used CHECK (last_used_at IS NULL OR last_used_at >= created_at),
    CONSTRAINT chk_api_key_rotated_time CHECK (rotated_at IS NULL OR rotated_at >= created_at),
    CONSTRAINT chk_api_key_revoked_time CHECK (revoked_at IS NULL OR revoked_at >= created_at),
    CONSTRAINT chk_api_key_no_self_replacement CHECK (replacement_key_id IS NULL OR replacement_key_id <> id),
    CONSTRAINT chk_revoked_api_key CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL),
    CONSTRAINT chk_rotated_api_key CHECK (status <> 'ROTATED' OR (rotated_at IS NOT NULL AND replacement_key_id IS NOT NULL)),
    CONSTRAINT chk_expired_api_key CHECK (status <> 'EXPIRED' OR expires_at IS NOT NULL)
);

CREATE TABLE api_key_scopes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id uuid NOT NULL,
    scope_code varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_api_key_scope UNIQUE (api_key_id, scope_code),
    CONSTRAINT chk_api_key_scope_code CHECK (char_length(trim(scope_code)) > 0)
);

CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid,
    actor_api_key_id uuid,
    actor_type audit_actor_type NOT NULL,
    action varchar(150) NOT NULL,
    resource_type varchar(100) NOT NULL,
    resource_id uuid,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    before_data jsonb,
    after_data jsonb,
    correlation_id varchar(255),
    source varchar(100),
    source_ip varchar(45),
    user_agent text,
    previous_hash varchar(255),
    record_hash varchar(255) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_audit_actor_identity CHECK (
        (actor_type = 'USER' AND actor_user_id IS NOT NULL AND actor_api_key_id IS NULL)
        OR (actor_type = 'API_KEY' AND actor_user_id IS NULL AND actor_api_key_id IS NOT NULL)
        OR (actor_type = 'SYSTEM' AND actor_user_id IS NULL AND actor_api_key_id IS NULL)
    ),
    CONSTRAINT chk_audit_action CHECK (char_length(trim(action)) > 0),
    CONSTRAINT chk_audit_resource_type CHECK (char_length(trim(resource_type)) > 0),
    CONSTRAINT chk_audit_record_hash CHECK (char_length(trim(record_hash)) > 0)
);

CREATE TABLE event_data_governance_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    purpose text NOT NULL,
    event_family event_family,
    retention_days int NOT NULL,
    access_scope varchar(255),
    masking_rules jsonb,
    export_allowed boolean NOT NULL DEFAULT false,
    archive_after_days int,
    deletion_enabled boolean NOT NULL DEFAULT true,
    status governance_policy_status NOT NULL DEFAULT 'ACTIVE',
    created_by uuid NOT NULL,
    updated_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_governance_policy_name CHECK (char_length(trim(name)) > 0),
    CONSTRAINT chk_event_governance_purpose CHECK (char_length(trim(purpose)) > 0),
    CONSTRAINT chk_event_retention_days CHECK (retention_days > 0),
    CONSTRAINT chk_archive_after_days CHECK (archive_after_days IS NULL OR archive_after_days > 0),
    CONSTRAINT chk_archive_before_deletion CHECK (archive_after_days IS NULL OR archive_after_days <= retention_days),
    CONSTRAINT chk_governance_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE report_exports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type varchar(100) NOT NULL,
    requested_by uuid NOT NULL,
    filters jsonb,
    status report_export_status NOT NULL DEFAULT 'REQUESTED',
    storage_uri text,
    generated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_report_type CHECK (char_length(trim(report_type)) > 0),
    CONSTRAINT chk_report_generation_time CHECK (generated_at IS NULL OR generated_at >= created_at),
    CONSTRAINT chk_completed_report_time CHECK (status <> 'COMPLETED' OR generated_at IS NOT NULL)
);

-- ============================================================
-- 11. POLICY MANAGEMENT
-- ============================================================

CREATE TABLE policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_code varchar(100) NOT NULL UNIQUE,
    title varchar(255) NOT NULL,
    description text,
    owner_user_id uuid,
    status policy_status NOT NULL DEFAULT 'DRAFT',
    current_published_version_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_policy_code CHECK (char_length(trim(policy_code)) > 0),
    CONSTRAINT chk_policy_title CHECK (char_length(trim(title)) > 0),
    CONSTRAINT chk_policy_updated_time CHECK (updated_at >= created_at)
);

CREATE TABLE policy_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id uuid NOT NULL,
    version_number varchar(50) NOT NULL,
    content text NOT NULL,
    change_summary text,
    status policy_version_status NOT NULL DEFAULT 'DRAFT',
    author_user_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    CONSTRAINT uq_policy_version UNIQUE (policy_id, version_number),
    CONSTRAINT chk_policy_version_number CHECK (char_length(trim(version_number)) > 0),
    CONSTRAINT chk_policy_content CHECK (char_length(trim(content)) > 0),
    CONSTRAINT chk_policy_publication_state CHECK (
        (status IN ('PUBLISHED','SUPERSEDED') AND published_at IS NOT NULL)
        OR (status NOT IN ('PUBLISHED','SUPERSEDED') AND published_at IS NULL)
    ),
    CONSTRAINT chk_policy_publication_time CHECK (published_at IS NULL OR published_at >= created_at)
);

CREATE TABLE policy_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_version_id uuid NOT NULL,
    action policy_decision_action NOT NULL,
    actor_user_id uuid NOT NULL,
    comment text,
    decided_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_policy_negative_decision_reason CHECK (action NOT IN ('REVISION_REQUESTED','REJECTED') OR comment IS NOT NULL)
);

CREATE TABLE policy_acknowledgements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_version_id uuid NOT NULL,
    user_id uuid NOT NULL,
    acknowledged_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_policy_acknowledgement UNIQUE (policy_version_id, user_id)
);

-- ============================================================
-- FOREIGN KEYS
-- ============================================================

ALTER TABLE auth_sessions ADD CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE password_reset_tokens ADD CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE business_services ADD CONSTRAINT fk_business_service_owner FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE assets ADD CONSTRAINT fk_asset_owner FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE assets ADD CONSTRAINT fk_asset_business_service FOREIGN KEY (business_service_id) REFERENCES business_services(id);
ALTER TABLE assets ADD CONSTRAINT fk_asset_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE asset_dependencies ADD CONSTRAINT fk_asset_dependency_asset FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE asset_dependencies ADD CONSTRAINT fk_asset_dependency_parent FOREIGN KEY (depends_on_asset_id) REFERENCES assets(id);
ALTER TABLE user_access_scopes ADD CONSTRAINT fk_access_scope_user FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE user_access_scopes ADD CONSTRAINT fk_access_scope_business_service FOREIGN KEY (business_service_id) REFERENCES business_services(id);
ALTER TABLE user_access_scopes ADD CONSTRAINT fk_access_scope_asset FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE user_access_scopes ADD CONSTRAINT fk_access_scope_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id);

ALTER TABLE risks ADD CONSTRAINT fk_risk_owner FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE risks ADD CONSTRAINT fk_risk_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE risk_assets ADD CONSTRAINT fk_risk_assets_risk FOREIGN KEY (risk_id) REFERENCES risks(id);
ALTER TABLE risk_assets ADD CONSTRAINT fk_risk_assets_asset FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE risk_threats ADD CONSTRAINT fk_risk_threat_risk FOREIGN KEY (risk_id) REFERENCES risks(id);
ALTER TABLE risk_vulnerabilities ADD CONSTRAINT fk_risk_vulnerability_risk FOREIGN KEY (risk_id) REFERENCES risks(id);
ALTER TABLE risk_assessments ADD CONSTRAINT fk_risk_assessment_risk FOREIGN KEY (risk_id) REFERENCES risks(id);
ALTER TABLE risk_assessments ADD CONSTRAINT fk_risk_assessment_assessed_by FOREIGN KEY (assessed_by) REFERENCES users(id);
ALTER TABLE risk_assessments ADD CONSTRAINT fk_risk_assessment_reassessment FOREIGN KEY (reassessment_request_id) REFERENCES risk_reassessment_requests(id);
ALTER TABLE risk_treatment_plans ADD CONSTRAINT fk_treatment_plan_risk FOREIGN KEY (risk_id) REFERENCES risks(id);
ALTER TABLE risk_treatment_plans ADD CONSTRAINT fk_treatment_plan_assessment FOREIGN KEY (source_assessment_id) REFERENCES risk_assessments(id);
ALTER TABLE risk_treatment_plans ADD CONSTRAINT fk_treatment_plan_owner FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE risk_treatment_plans ADD CONSTRAINT fk_treatment_plan_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE risk_treatment_actions ADD CONSTRAINT fk_treatment_action_plan FOREIGN KEY (treatment_plan_id) REFERENCES risk_treatment_plans(id);
ALTER TABLE risk_treatment_actions ADD CONSTRAINT fk_treatment_action_owner FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE risk_acceptances ADD CONSTRAINT fk_risk_acceptance_risk FOREIGN KEY (risk_id) REFERENCES risks(id);
ALTER TABLE risk_acceptances ADD CONSTRAINT fk_risk_acceptance_requested_by FOREIGN KEY (requested_by) REFERENCES users(id);
ALTER TABLE risk_acceptances ADD CONSTRAINT fk_risk_acceptance_decided_by FOREIGN KEY (decided_by) REFERENCES users(id);

ALTER TABLE security_controls ADD CONSTRAINT fk_control_owner FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE security_controls ADD CONSTRAINT fk_control_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE control_risk_links ADD CONSTRAINT fk_control_risk_control FOREIGN KEY (control_id) REFERENCES security_controls(id);
ALTER TABLE control_risk_links ADD CONSTRAINT fk_control_risk_risk FOREIGN KEY (risk_id) REFERENCES risks(id);
ALTER TABLE control_asset_links ADD CONSTRAINT fk_control_asset_control FOREIGN KEY (control_id) REFERENCES security_controls(id);
ALTER TABLE control_asset_links ADD CONSTRAINT fk_control_asset_asset FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE control_assessments ADD CONSTRAINT fk_control_assessment_control FOREIGN KEY (control_id) REFERENCES security_controls(id);
ALTER TABLE control_assessments ADD CONSTRAINT fk_control_assessment_assessed_by FOREIGN KEY (assessed_by) REFERENCES users(id);
ALTER TABLE control_findings ADD CONSTRAINT fk_control_finding_control FOREIGN KEY (control_id) REFERENCES security_controls(id);
ALTER TABLE control_findings ADD CONSTRAINT fk_control_finding_identified_by FOREIGN KEY (identified_by) REFERENCES users(id);
ALTER TABLE evidence_items ADD CONSTRAINT fk_evidence_owner FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE evidence_items ADD CONSTRAINT fk_evidence_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE control_evidence_links ADD CONSTRAINT fk_control_evidence_control FOREIGN KEY (control_id) REFERENCES security_controls(id);
ALTER TABLE control_evidence_links ADD CONSTRAINT fk_control_evidence_evidence FOREIGN KEY (evidence_id) REFERENCES evidence_items(id);
ALTER TABLE control_evidence_links ADD CONSTRAINT fk_control_evidence_linked_by FOREIGN KEY (linked_by) REFERENCES users(id);

ALTER TABLE event_sources ADD CONSTRAINT fk_event_source_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE event_source_families ADD CONSTRAINT fk_event_source_family_source FOREIGN KEY (event_source_id) REFERENCES event_sources(id);
ALTER TABLE asset_event_sources ADD CONSTRAINT fk_asset_event_source_asset FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE asset_event_sources ADD CONSTRAINT fk_asset_event_source_source FOREIGN KEY (event_source_id) REFERENCES event_sources(id);
ALTER TABLE event_schemas ADD CONSTRAINT fk_event_schema_source FOREIGN KEY (event_source_id) REFERENCES event_sources(id);
ALTER TABLE event_ingestion_batches ADD CONSTRAINT fk_ingestion_batch_source FOREIGN KEY (event_source_id) REFERENCES event_sources(id);
ALTER TABLE event_ingestion_batches ADD CONSTRAINT fk_ingestion_batch_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE monitored_accounts ADD CONSTRAINT fk_monitored_account_asset FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE monitored_accounts ADD CONSTRAINT fk_monitored_account_user FOREIGN KEY (linked_user_id) REFERENCES users(id);
ALTER TABLE normalized_events ADD CONSTRAINT fk_normalized_event_source FOREIGN KEY (event_source_id) REFERENCES event_sources(id);
ALTER TABLE normalized_events ADD CONSTRAINT fk_normalized_event_batch FOREIGN KEY (ingestion_batch_id) REFERENCES event_ingestion_batches(id);
ALTER TABLE invalid_events ADD CONSTRAINT fk_invalid_event_source FOREIGN KEY (event_source_id) REFERENCES event_sources(id);
ALTER TABLE invalid_events ADD CONSTRAINT fk_invalid_event_batch FOREIGN KEY (ingestion_batch_id) REFERENCES event_ingestion_batches(id);
ALTER TABLE event_entity_mappings ADD CONSTRAINT fk_event_mapping_event FOREIGN KEY (event_id) REFERENCES normalized_events(id);
ALTER TABLE event_entity_mappings ADD CONSTRAINT fk_event_mapping_user FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE event_entity_mappings ADD CONSTRAINT fk_event_mapping_account FOREIGN KEY (monitored_account_id) REFERENCES monitored_accounts(id);
ALTER TABLE event_entity_mappings ADD CONSTRAINT fk_event_mapping_asset FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE event_entity_mappings ADD CONSTRAINT fk_event_mapping_mapped_by FOREIGN KEY (mapped_by) REFERENCES users(id);
ALTER TABLE event_entity_mappings ADD CONSTRAINT fk_event_mapping_supersedes FOREIGN KEY (supersedes_mapping_id) REFERENCES event_entity_mappings(id);

ALTER TABLE ai_model_versions ADD CONSTRAINT fk_model_dataset FOREIGN KEY (dataset_id) REFERENCES ai_datasets(id);
ALTER TABLE ai_model_evaluations ADD CONSTRAINT fk_model_evaluation_version FOREIGN KEY (model_version_id) REFERENCES ai_model_versions(id);
ALTER TABLE anomaly_detections ADD CONSTRAINT fk_detection_event FOREIGN KEY (event_id) REFERENCES normalized_events(id);
ALTER TABLE anomaly_detections ADD CONSTRAINT fk_detection_model FOREIGN KEY (model_version_id) REFERENCES ai_model_versions(id);
ALTER TABLE anomaly_feature_contributions ADD CONSTRAINT fk_feature_contribution_detection FOREIGN KEY (detection_id) REFERENCES anomaly_detections(id);
ALTER TABLE anomaly_alerts ADD CONSTRAINT fk_alert_detection FOREIGN KEY (detection_id) REFERENCES anomaly_detections(id);
ALTER TABLE anomaly_alerts ADD CONSTRAINT fk_alert_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id);

ALTER TABLE alert_triage_records ADD CONSTRAINT fk_triage_alert FOREIGN KEY (alert_id) REFERENCES anomaly_alerts(id);
ALTER TABLE alert_triage_records ADD CONSTRAINT fk_triage_analyst FOREIGN KEY (analyst_user_id) REFERENCES users(id);
ALTER TABLE alert_triage_records ADD CONSTRAINT fk_triage_model FOREIGN KEY (model_version_id) REFERENCES ai_model_versions(id);
ALTER TABLE security_findings ADD CONSTRAINT fk_security_finding_alert FOREIGN KEY (alert_id) REFERENCES anomaly_alerts(id);
ALTER TABLE security_findings ADD CONSTRAINT fk_security_finding_triage FOREIGN KEY (triage_record_id) REFERENCES alert_triage_records(id);
ALTER TABLE security_findings ADD CONSTRAINT fk_security_finding_identified_by FOREIGN KEY (identified_by) REFERENCES users(id);

ALTER TABLE incidents ADD CONSTRAINT fk_incident_finding FOREIGN KEY (finding_id) REFERENCES security_findings(id);
ALTER TABLE incidents ADD CONSTRAINT fk_incident_handler FOREIGN KEY (handler_user_id) REFERENCES users(id);
ALTER TABLE incidents ADD CONSTRAINT fk_incident_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE incident_actions ADD CONSTRAINT fk_incident_action_incident FOREIGN KEY (incident_id) REFERENCES incidents(id);
ALTER TABLE incident_actions ADD CONSTRAINT fk_incident_action_performed_by FOREIGN KEY (performed_by) REFERENCES users(id);
ALTER TABLE incident_analysis ADD CONSTRAINT fk_incident_analysis_incident FOREIGN KEY (incident_id) REFERENCES incidents(id);
ALTER TABLE incident_analysis ADD CONSTRAINT fk_incident_analysis_analyzed_by FOREIGN KEY (analyzed_by) REFERENCES users(id);
ALTER TABLE incident_evidence ADD CONSTRAINT fk_incident_evidence_incident FOREIGN KEY (incident_id) REFERENCES incidents(id);
ALTER TABLE incident_evidence ADD CONSTRAINT fk_incident_evidence_event FOREIGN KEY (normalized_event_id) REFERENCES normalized_events(id);
ALTER TABLE incident_evidence ADD CONSTRAINT fk_incident_evidence_registered_by FOREIGN KEY (registered_by) REFERENCES users(id);
ALTER TABLE incident_assets ADD CONSTRAINT fk_incident_assets_incident FOREIGN KEY (incident_id) REFERENCES incidents(id);
ALTER TABLE incident_assets ADD CONSTRAINT fk_incident_assets_asset FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE incident_assets ADD CONSTRAINT fk_incident_assets_linked_by FOREIGN KEY (linked_by) REFERENCES users(id);
ALTER TABLE incident_controls ADD CONSTRAINT fk_incident_controls_incident FOREIGN KEY (incident_id) REFERENCES incidents(id);
ALTER TABLE incident_controls ADD CONSTRAINT fk_incident_controls_control FOREIGN KEY (control_id) REFERENCES security_controls(id);
ALTER TABLE incident_controls ADD CONSTRAINT fk_incident_controls_linked_by FOREIGN KEY (linked_by) REFERENCES users(id);
ALTER TABLE incident_risks ADD CONSTRAINT fk_incident_risks_incident FOREIGN KEY (incident_id) REFERENCES incidents(id);
ALTER TABLE incident_risks ADD CONSTRAINT fk_incident_risks_risk FOREIGN KEY (risk_id) REFERENCES risks(id);
ALTER TABLE incident_risks ADD CONSTRAINT fk_incident_risks_linked_by FOREIGN KEY (linked_by) REFERENCES users(id);

ALTER TABLE control_findings ADD CONSTRAINT fk_control_finding_incident FOREIGN KEY (incident_id) REFERENCES incidents(id);
ALTER TABLE risk_reassessment_requests ADD CONSTRAINT fk_reassessment_incident FOREIGN KEY (incident_id) REFERENCES incidents(id);
ALTER TABLE risk_reassessment_requests ADD CONSTRAINT fk_reassessment_risk FOREIGN KEY (risk_id) REFERENCES risks(id);
ALTER TABLE risk_reassessment_requests ADD CONSTRAINT fk_reassessment_control_finding FOREIGN KEY (control_finding_id) REFERENCES control_findings(id);
ALTER TABLE risk_reassessment_requests ADD CONSTRAINT fk_reassessment_requested_by FOREIGN KEY (requested_by) REFERENCES users(id);
ALTER TABLE risk_reassessment_requests ADD CONSTRAINT fk_reassessment_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id);

ALTER TABLE integration_api_keys ADD CONSTRAINT fk_api_key_event_source FOREIGN KEY (event_source_id) REFERENCES event_sources(id);
ALTER TABLE integration_api_keys ADD CONSTRAINT fk_api_key_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE integration_api_keys ADD CONSTRAINT fk_api_key_revoked_by FOREIGN KEY (revoked_by) REFERENCES users(id);
ALTER TABLE integration_api_keys ADD CONSTRAINT fk_api_key_replacement FOREIGN KEY (replacement_key_id) REFERENCES integration_api_keys(id);
ALTER TABLE api_key_scopes ADD CONSTRAINT fk_api_scope_key FOREIGN KEY (api_key_id) REFERENCES integration_api_keys(id);
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_actor_api_key FOREIGN KEY (actor_api_key_id) REFERENCES integration_api_keys(id);
ALTER TABLE event_data_governance_policies ADD CONSTRAINT fk_governance_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE event_data_governance_policies ADD CONSTRAINT fk_governance_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE report_exports ADD CONSTRAINT fk_report_requested_by FOREIGN KEY (requested_by) REFERENCES users(id);

ALTER TABLE policies ADD CONSTRAINT fk_policy_owner FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE policy_versions ADD CONSTRAINT fk_policy_version_policy FOREIGN KEY (policy_id) REFERENCES policies(id);
ALTER TABLE policy_versions ADD CONSTRAINT fk_policy_version_author FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE policies ADD CONSTRAINT fk_policy_current_version FOREIGN KEY (current_published_version_id) REFERENCES policy_versions(id);
ALTER TABLE policy_decisions ADD CONSTRAINT fk_policy_decision_version FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id);
ALTER TABLE policy_decisions ADD CONSTRAINT fk_policy_decision_actor FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE policy_acknowledgements ADD CONSTRAINT fk_policy_ack_version FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id);
ALTER TABLE policy_acknowledgements ADD CONSTRAINT fk_policy_ack_user FOREIGN KEY (user_id) REFERENCES users(id);

-- ============================================================
-- INDEXES
-- PostgreSQL does not automatically index FK columns, so indexes are
-- added for common navigation/query paths.
-- ============================================================

CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id);
CREATE INDEX idx_access_scopes_user ON user_access_scopes(user_id);
CREATE INDEX idx_assets_owner ON assets(owner_user_id);
CREATE INDEX idx_assets_business_service ON assets(business_service_id);
CREATE INDEX idx_risks_owner ON risks(owner_user_id);
CREATE INDEX idx_risk_assets_asset ON risk_assets(asset_id);
CREATE INDEX idx_risk_assessments_risk ON risk_assessments(risk_id, assessed_at DESC);
CREATE INDEX idx_risk_treatment_plans_risk ON risk_treatment_plans(risk_id);
CREATE INDEX idx_control_risk_links_risk ON control_risk_links(risk_id);
CREATE INDEX idx_control_asset_links_asset ON control_asset_links(asset_id);
CREATE INDEX idx_control_findings_control ON control_findings(control_id);
CREATE INDEX idx_control_findings_incident ON control_findings(incident_id);
CREATE INDEX idx_evidence_owner ON evidence_items(owner_user_id);

CREATE INDEX idx_event_sources_status ON event_sources(status);
CREATE INDEX idx_event_batches_source ON event_ingestion_batches(event_source_id, created_at DESC);
CREATE INDEX idx_normalized_events_source_time ON normalized_events(event_source_id, occurred_at DESC);
CREATE INDEX idx_normalized_events_occurred_at ON normalized_events(occurred_at DESC);
CREATE INDEX idx_normalized_events_family ON normalized_events(event_family);
CREATE INDEX idx_normalized_events_mapping_status ON normalized_events(mapping_status);
CREATE INDEX idx_invalid_events_batch ON invalid_events(ingestion_batch_id);
CREATE INDEX idx_event_mappings_event ON event_entity_mappings(event_id);
CREATE UNIQUE INDEX uq_active_event_user_mapping
    ON event_entity_mappings(event_id)
    WHERE is_active = true AND user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_active_event_account_mapping
    ON event_entity_mappings(event_id)
    WHERE is_active = true AND monitored_account_id IS NOT NULL;
CREATE UNIQUE INDEX uq_active_event_asset_mapping
    ON event_entity_mappings(event_id)
    WHERE is_active = true AND asset_id IS NOT NULL;

CREATE INDEX idx_ai_evaluations_model ON ai_model_evaluations(model_version_id, evaluated_at DESC);
CREATE INDEX idx_anomaly_detections_event ON anomaly_detections(event_id);
CREATE INDEX idx_anomaly_detections_model ON anomaly_detections(model_version_id);
CREATE INDEX idx_anomaly_detections_time ON anomaly_detections(detected_at DESC);
CREATE INDEX idx_feature_contributions_detection ON anomaly_feature_contributions(detection_id, rank);
CREATE INDEX idx_anomaly_alerts_status ON anomaly_alerts(status, generated_at DESC);
CREATE INDEX idx_triage_alert ON alert_triage_records(alert_id, created_at DESC);
CREATE INDEX idx_security_findings_status ON security_findings(status, identified_at DESC);

CREATE INDEX idx_incidents_status ON incidents(status, created_at DESC);
CREATE INDEX idx_incidents_handler ON incidents(handler_user_id);
CREATE INDEX idx_incident_actions_incident ON incident_actions(incident_id, performed_at);
CREATE INDEX idx_incident_evidence_incident ON incident_evidence(incident_id);
CREATE INDEX idx_reassessment_risk ON risk_reassessment_requests(risk_id, requested_at DESC);
CREATE INDEX idx_reassessment_incident ON risk_reassessment_requests(incident_id);

CREATE INDEX idx_api_keys_status ON integration_api_keys(status);
CREATE INDEX idx_api_keys_source ON integration_api_keys(event_source_id);
CREATE INDEX idx_audit_actor_user ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_actor_api_key ON audit_logs(actor_api_key_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_occurred_at ON audit_logs(occurred_at DESC);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX idx_governance_family ON event_data_governance_policies(event_family, status);
CREATE INDEX idx_report_exports_requester ON report_exports(requested_by, created_at DESC);

CREATE INDEX idx_policy_versions_policy ON policy_versions(policy_id, created_at DESC);
CREATE INDEX idx_policy_decisions_version ON policy_decisions(policy_version_id, decided_at DESC);

-- ============================================================
-- AUTOMATIC updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_business_services_updated_at
BEFORE UPDATE ON business_services
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_assets_updated_at
BEFORE UPDATE ON assets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_risks_updated_at
BEFORE UPDATE ON risks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reassessment_requests_updated_at
BEFORE UPDATE ON risk_reassessment_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_risk_treatment_plans_updated_at
BEFORE UPDATE ON risk_treatment_plans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_risk_treatment_actions_updated_at
BEFORE UPDATE ON risk_treatment_actions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_security_controls_updated_at
BEFORE UPDATE ON security_controls
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_event_sources_updated_at
BEFORE UPDATE ON event_sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_event_schemas_updated_at
BEFORE UPDATE ON event_schemas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_monitored_accounts_updated_at
BEFORE UPDATE ON monitored_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_anomaly_alerts_updated_at
BEFORE UPDATE ON anomaly_alerts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_security_findings_updated_at
BEFORE UPDATE ON security_findings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_incidents_updated_at
BEFORE UPDATE ON incidents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_incident_analysis_updated_at
BEFORE UPDATE ON incident_analysis
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_governance_policies_updated_at
BEFORE UPDATE ON event_data_governance_policies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_policies_updated_at
BEFORE UPDATE ON policies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- AUDIT LOG IMMUTABILITY
-- Prevent UPDATE / DELETE at DB level.
-- Inserts must provide record_hash.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only: UPDATE and DELETE are not allowed';
END;
$$;

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- ============================================================
-- CROSS-ENTITY BUSINESS RULES (SERVICE / TRANSACTION LAYER)
-- These are intentionally NOT implemented as CHECK constraints:
-- 1) anomaly_alerts may only be created for is_anomaly = true.
-- 2) Incident created from alert flow requires confirmed security finding;
--    manual incident creation may have finding_id = NULL.
-- 3) policies.current_published_version_id must belong to the same policy
--    and reference a published/superseded version according to workflow.
-- 4) Risk/Policy authorization scopes are verified by application service.
-- 5) event_schemas.event_family must be supported by event_source_families.
-- 6) API key plaintext is returned once only; DB stores only secret_hash.
-- 7) audit_logs record_hash/previous_hash chain generation is handled by
--    trusted service logic (or a dedicated serialization mechanism).
-- ============================================================

COMMIT;
