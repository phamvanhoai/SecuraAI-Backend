import { describe, expect, it } from 'vitest';
import { updateThreatBodySchema } from '../src/modules/risk-assessment/dto/identify-threat.dto.js';

describe('update threat contract', () => {
  const valid = {
    name: 'Credential theft',
    description: 'Phishing captures privileged credentials.',
    vulnerabilityIds: ['00000000-0000-4000-8000-000000000001'],
    expectedUpdatedAt: '2026-10-12T10:00:00.000Z',
  };

  it('requires a concurrency timestamp and at least one unique vulnerability', () => {
    expect(updateThreatBodySchema.safeParse(valid).success).toBe(true);
    expect(updateThreatBodySchema.safeParse({ ...valid, expectedUpdatedAt: undefined }).success).toBe(false);
    expect(updateThreatBodySchema.safeParse({ ...valid, vulnerabilityIds: [] }).success).toBe(false);
    expect(updateThreatBodySchema.safeParse({
      ...valid,
      vulnerabilityIds: [...valid.vulnerabilityIds, ...valid.vulnerabilityIds],
    }).success).toBe(false);
  });
});
