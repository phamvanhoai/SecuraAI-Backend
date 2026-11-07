CREATE TABLE public.detection_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar(20) NOT NULL CHECK (kind IN ('DETECTION','EXPLANATION')),
  event_id uuid REFERENCES public.normalized_events(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.anomaly_alerts(id) ON DELETE CASCADE,
  model_version_id uuid NOT NULL REFERENCES public.ai_model_versions(id),
  engine_version varchar(100) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','COMPLETED','INSUFFICIENT_BASELINE','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token uuid,
  lease_until timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  error_code varchar(100),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_detection_job_target CHECK (
    (kind='DETECTION' AND event_id IS NOT NULL AND alert_id IS NULL) OR
    (kind='EXPLANATION' AND alert_id IS NOT NULL AND event_id IS NULL)),
  CONSTRAINT uq_detection_job_event UNIQUE(kind,event_id,model_version_id,engine_version),
  CONSTRAINT uq_detection_job_alert UNIQUE(kind,alert_id,model_version_id,engine_version)
);
CREATE INDEX idx_detection_jobs_claim ON public.detection_jobs(kind,status,available_at,lease_until);
CREATE INDEX idx_detection_jobs_event ON public.detection_jobs(event_id);
CREATE INDEX idx_detection_jobs_alert ON public.detection_jobs(alert_id);
-- Jobs are discovered by the worker from committed events/alerts. The anti-join
-- plus unique keys repairs a crash between ingestion commit and scheduling.
