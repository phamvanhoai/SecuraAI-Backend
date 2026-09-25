import { describe, expect, it } from 'vitest';
import { runAnomalyDetectionBodySchema } from '../src/modules/ai-anomaly-detection-alerts/dto/run-anomaly-detection.dto.js';

describe('run anomaly detection DTO', () => {
  it('applies bounded defaults', () => {
    expect(runAnomalyDetectionBodySchema.parse({})).toEqual({ lookbackHours: 24, maxEvents: 100 });
  });

  it('rejects unbounded batches and unknown fields', () => {
    expect(runAnomalyDetectionBodySchema.safeParse({ maxEvents: 501 }).success).toBe(false);
    expect(runAnomalyDetectionBodySchema.safeParse({ unexpected: true }).success).toBe(false);
  });
});
