-- Rename the active engine without creating a new detection identity.
-- Updating existing rows prevents previously evaluated events and queued jobs
-- from being treated as work for a different engine version.
UPDATE anomaly_detections
SET engine_version = 'ml-llm-pipeline-v1'
WHERE engine_version = 'history-pipeline-v1';

UPDATE detection_jobs
SET engine_version = 'ml-llm-pipeline-v1'
WHERE engine_version = 'history-pipeline-v1';
