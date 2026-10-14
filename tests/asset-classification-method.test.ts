import { describe, expect, it } from 'vitest';
import { calculateAssetCriticality } from '../src/modules/it-asset-management/asset-classification-method.js';

describe('SECURAAI-ASSET-IMPACT-v1', () => {
  it.each([
    [1, 'low'],
    [2, 'medium'],
    [3, 'medium'],
    [4, 'high'],
    [5, 'critical'],
  ])('maps maximum %s to %s', (score, criticality) => {
    expect(
      calculateAssetCriticality({
        confidentialityImpact: Number(score),
        integrityImpact: 1,
        availabilityImpact: 1,
        businessImpact: 1,
      }),
    ).toEqual({ score, criticality });
  });
  it('never dilutes a critical criterion with low scores', () => {
    for (const criterion of [
      'confidentialityImpact',
      'integrityImpact',
      'availabilityImpact',
      'businessImpact',
    ]) {
      expect(
        calculateAssetCriticality({
          confidentialityImpact: 1,
          integrityImpact: 1,
          availabilityImpact: 1,
          businessImpact: 1,
          [criterion]: 5,
        }),
      ).toEqual({ score: 5, criticality: 'critical' });
    }
  });
});
