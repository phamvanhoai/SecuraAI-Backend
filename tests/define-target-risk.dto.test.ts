import { describe, expect, it } from 'vitest';
import { defineTargetRiskBodySchema } from '../src/modules/risk-assessment/dto/define-target-risk.dto.js';
describe('define target risk contract', () => {
  const valid = {
    treatmentPlanId: '00000000-0000-4000-8000-000000000001',
    targetRisk: 'low',
    rationale: 'Expected exposure after all planned treatment actions are completed.',
  } as const;
  it('accepts a target tied to a treatment plan', () =>
    expect(defineTargetRiskBodySchema.safeParse(valid).success).toBe(true));
  it('rejects a missing plan', () =>
    expect(defineTargetRiskBodySchema.safeParse({ ...valid, treatmentPlanId: '' }).success).toBe(
      false,
    ));
});
