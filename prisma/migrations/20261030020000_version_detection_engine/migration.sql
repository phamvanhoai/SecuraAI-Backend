-- Preserve prior results while allowing each engine revision to evaluate an event once.
ALTER TABLE public.anomaly_detections
  ADD COLUMN engine_version varchar(100) NOT NULL DEFAULT 'LEGACY';

UPDATE public.anomaly_detections AS detection
SET engine_version = 'contextual-rules-v1'
WHERE EXISTS (
  SELECT 1 FROM public.anomaly_feature_contributions AS feature
  WHERE feature.detection_id = detection.id
    AND feature.feature_name = 'engine_version'
    AND feature.feature_value = '"contextual-rules-v1"'
);

ALTER TABLE public.anomaly_detections
  DROP CONSTRAINT uq_anomaly_detection_event_model,
  ADD CONSTRAINT uq_anomaly_detection_event_model_engine
    UNIQUE (event_id, model_version_id, engine_version);
