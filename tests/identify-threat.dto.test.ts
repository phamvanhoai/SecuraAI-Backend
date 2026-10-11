import { describe, expect, it } from 'vitest';
import { identifyThreatBodySchema } from '../src/modules/risk-assessment/dto/identify-threat.dto.js';

describe('identify threat contract', () => {
  const valid = {
    name: 'Credential stuffing',
    description: 'An attacker reuses exposed credentials against the customer portal.',
    vulnerabilityIds: ['00000000-0000-4000-8000-000000000001'],
  };
  it('accepts a documented threat with vulnerability links', () => {
    expect(identifyThreatBodySchema.safeParse(valid).success).toBe(true);
  });
  it('requires at least one unique vulnerability', () => {
    expect(identifyThreatBodySchema.safeParse({ ...valid, vulnerabilityIds: [] }).success).toBe(
      false,
    );
    expect(
      identifyThreatBodySchema.safeParse({
        ...valid,
        vulnerabilityIds: [...valid.vulnerabilityIds, ...valid.vulnerabilityIds],
      }).success,
    ).toBe(false);
  });
});
