-- Audit the staged ML triage -> LLM final-review workflow.
ALTER TABLE public.anomaly_detections
  DROP CONSTRAINT chk_anomaly_threshold_decision,
  ADD CONSTRAINT chk_anomaly_threshold_decision CHECK (
    (threshold_source = 'RULE_MATCH' AND is_anomaly = true)
    OR
    (threshold_source IN (
        'MODEL_DEFAULT', 'ASSET_OVERRIDE', 'AI_FUSION',
        'AI_MODEL_TRIAGE', 'AI_LLM_FINAL'
      ) AND is_anomaly = (anomaly_score >= threshold))
    OR
    (threshold_source = 'AI_REVIEW_PENDING' AND is_anomaly = false)
  );

COMMENT ON COLUMN public.anomaly_detections.threshold_source IS
  'Decision origin: contextual threshold, legacy AI_FUSION, AI_MODEL_TRIAGE, AI_LLM_FINAL, or AI_REVIEW_PENDING.';
