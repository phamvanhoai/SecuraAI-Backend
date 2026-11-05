-- Record weighted LLM + ML decisions as their own auditable threshold source.
ALTER TABLE public.anomaly_detections
  DROP CONSTRAINT chk_anomaly_threshold_decision,
  ADD CONSTRAINT chk_anomaly_threshold_decision CHECK (
    (threshold_source = 'RULE_MATCH' AND is_anomaly = true)
    OR
    (threshold_source IN ('MODEL_DEFAULT', 'ASSET_OVERRIDE', 'AI_FUSION')
      AND is_anomaly = (anomaly_score >= threshold))
  );

COMMENT ON COLUMN public.anomaly_detections.threshold_source IS
  'Decision origin: MODEL_DEFAULT, ASSET_OVERRIDE, or AI_FUSION for score-threshold decisions; RULE_MATCH for matched rules.';
