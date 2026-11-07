-- Preserve the configured threshold snapshot while recording rule decisions
-- independently from score-threshold decisions. Existing rows remain valid.
ALTER TABLE public.anomaly_detections
  DROP CONSTRAINT chk_anomaly_threshold_decision,
  ADD CONSTRAINT chk_anomaly_threshold_decision CHECK (
    (threshold_source = 'RULE_MATCH' AND is_anomaly = true)
    OR
    (threshold_source IN ('MODEL_DEFAULT', 'ASSET_OVERRIDE')
      AND is_anomaly = (anomaly_score >= threshold))
  );

COMMENT ON COLUMN public.anomaly_detections.threshold_source IS
  'Decision origin: MODEL_DEFAULT or ASSET_OVERRIDE for score-threshold decisions; RULE_MATCH for matched rules. Original configured threshold origin is recorded in feature evidence.';
