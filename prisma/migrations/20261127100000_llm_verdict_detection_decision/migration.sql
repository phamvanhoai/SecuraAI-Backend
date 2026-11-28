-- The configured threshold decides whether ML escalates an event to the LLM.
-- The final is_anomaly value then follows the LLM verdict, not a second score comparison.
ALTER TABLE public.anomaly_detections
  DROP CONSTRAINT chk_anomaly_threshold_decision,
  ADD CONSTRAINT chk_anomaly_threshold_decision CHECK (
    threshold_source IN (
      'RULE_MATCH', 'MODEL_DEFAULT', 'ASSET_OVERRIDE', 'AI_FUSION',
      'AI_MODEL_TRIAGE', 'AI_LLM_FINAL', 'AI_REVIEW_PENDING'
    )
    AND (threshold_source <> 'RULE_MATCH' OR is_anomaly = true)
    AND (threshold_source <> 'AI_REVIEW_PENDING' OR is_anomaly = false)
  );

COMMENT ON COLUMN public.anomaly_detections.threshold_source IS
  'Configured threshold origin. ML uses it for LLM escalation; the final alert decision follows the LLM verdict.';
