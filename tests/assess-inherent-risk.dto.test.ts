import { describe, expect, it } from 'vitest';
import { assessInherentRiskBodySchema } from '../src/modules/risk-assessment/dto/assess-inherent-risk.dto.js';

describe('assess inherent risk contract', () => {
  it('accepts likelihood, impact, and a documented basis', () => {
    expect(
      assessInherentRiskBodySchema.safeParse({
        likelihood: 4,
        impact: 5,
        assessmentReason: 'Based on critical asset exposure and active threat scenarios.',
      }).success,
    ).toBe(true);
  });
  it('rejects out-of-range scores and an insufficient basis', () => {
    expect(
      assessInherentRiskBodySchema.safeParse({
        likelihood: 6,
        impact: 0,
        assessmentReason: 'short',
      }).success,
    ).toBe(false);
  });
});
