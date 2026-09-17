import { describe, expect, it } from 'vitest';
import { setAlertThresholdBodySchema } from '../src/modules/ai-alerts/dto/alert-threshold.dto.js';

describe('setAlertThresholdBodySchema', () => {
  it('accepts a bounded custom threshold', () => {
    expect(
      setAlertThresholdBodySchema.parse({ threshold: 0.8, riskLevelMin: 'high', enabled: true }),
    ).toEqual({ threshold: 0.8, riskLevelMin: 'high', enabled: true });
  });

  it.each([0, 1.01])('rejects an out-of-range threshold %s', (threshold) => {
    expect(setAlertThresholdBodySchema.safeParse({ threshold }).success).toBe(false);
  });
});
