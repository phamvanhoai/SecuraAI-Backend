ALTER TABLE anomaly_detections
  ADD COLUMN threshold_source varchar(30) NOT NULL DEFAULT 'MODEL_DEFAULT';

COMMENT ON COLUMN anomaly_detections.threshold_source IS
  'Threshold origin used for this detection: MODEL_DEFAULT or ASSET_OVERRIDE';
