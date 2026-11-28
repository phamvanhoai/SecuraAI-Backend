// Shared event shape consumed by the ML temporal-context builder.
export interface ContextEvent {
  id: string;
  event_source_id: string;
  event_family: string;
  event_type: string;
  occurred_at: Date;
  account_identifier: string | null;
  source_ip: string | null;
  device_identifier: string | null;
  severity: string | null;
  normalized_payload: unknown;
}

// Evidence stored with a detection so its final ML/LLM decision is explainable.
export interface DetectionFeature {
  featureName: string;
  featureValue: string;
  rank: number;
}

// Map the final LLM score to the severity stored on a new alert.
export function detectionSeverity(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 0.9) return 'CRITICAL';
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  return 'LOW';
}
