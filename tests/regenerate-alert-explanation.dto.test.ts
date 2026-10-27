import { describe, expect, it } from 'vitest';
import { regenerateAlertExplanationSchema } from '../src/modules/ai-anomaly-detection-alerts/dto/regenerate-alert-explanation.dto.js';

describe('regenerate alert explanation DTO', () => {
  it('trims and accepts a meaningful reason', () => {
    expect(
      regenerateAlertExplanationSchema.parse({ reason: '  New investigation evidence  ' }),
    ).toEqual({ reason: 'New investigation evidence' });
  });

  it('rejects short reasons and unknown fields', () => {
    expect(regenerateAlertExplanationSchema.safeParse({ reason: 'short' }).success).toBe(false);
    expect(
      regenerateAlertExplanationSchema.safeParse({
        reason: 'Review explanation accuracy',
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
