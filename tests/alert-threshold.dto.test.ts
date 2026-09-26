import { describe, expect, it } from 'vitest';
import {
  listAlertThresholdsQuerySchema,
  setAlertThresholdBodySchema,
} from '../src/modules/ai-anomaly-detection-alerts/dto/alert-threshold.dto.js';

describe('asset alert threshold DTOs', () => {
  it('bounds pagination and threshold values', () => {
    expect(listAlertThresholdsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(setAlertThresholdBodySchema.parse({ threshold: 0.75 })).toEqual({
      threshold: 0.75,
      riskLevelMin: null,
      enabled: true,
    });
    expect(setAlertThresholdBodySchema.safeParse({ threshold: 0 }).success).toBe(false);
    expect(setAlertThresholdBodySchema.safeParse({ threshold: 1.01 }).success).toBe(false);
  });
});
