ALTER TABLE anomaly_alerts
ADD COLUMN explanation_text text,
ADD COLUMN explanation_generated_at timestamptz;

UPDATE anomaly_alerts AS alert
SET
  explanation_text = format(
    'The anomaly score %s exceeded the model threshold %s. The suggested risk level is %s. No individual feature contributions were recorded.',
    trim(to_char(detection.anomaly_score, 'FM0.0000')),
    trim(to_char(detection.threshold, 'FM0.0000')),
    lower(coalesce(alert.severity, 'unknown'))
  ),
  explanation_generated_at = alert.generated_at
FROM anomaly_detections AS detection
WHERE detection.id = alert.detection_id;

ALTER TABLE anomaly_alerts
ALTER COLUMN explanation_text SET NOT NULL,
ALTER COLUMN explanation_generated_at SET NOT NULL,
ALTER COLUMN explanation_generated_at SET DEFAULT now();
