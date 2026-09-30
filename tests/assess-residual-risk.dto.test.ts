import { describe, expect, it } from 'vitest';
import { assessResidualRiskBodySchema } from '../src/modules/risk-assessment/dto/assess-residual-risk.dto.js';
describe('assess residual risk contract', () => {
  const valid = {
    likelihood: 2,
    impact: 3,
    targetRisk: 'low',
    riskAppetite: 'medium',
    riskTolerance: 'medium',
    assessmentReason: 'Remaining exposure after reviewing implemented controls.',
  } as const;
  it('accepts a complete assessment', () =>
    expect(assessResidualRiskBodySchema.safeParse(valid).success).toBe(true));
  it('rejects invalid scores', () =>
    expect(assessResidualRiskBodySchema.safeParse({ ...valid, likelihood: 0 }).success).toBe(
      false,
    ));
});
