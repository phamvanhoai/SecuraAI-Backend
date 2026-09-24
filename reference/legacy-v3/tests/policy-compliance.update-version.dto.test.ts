import { describe, expect, it } from 'vitest';
import {
  updatePolicyCreateVersionBodySchema,
  updatePolicyCreateVersionParamsSchema,
} from '../src/modules/policy-compliance/dto/update-policy-create-version.dto.js';

describe('update policy and create version DTO', () => {
  it('accepts a valid new policy version', () => {
    expect(
      updatePolicyCreateVersionBodySchema.parse({
        title: 'Updated security policy',
        description: null,
        versionNumber: '1.1',
        content: 'Updated policy content',
        changeSummary: 'Updated access control requirements',
      }),
    ).toMatchObject({ versionNumber: '1.1', description: null });
  });

  it('requires version content and a change summary', () => {
    expect(() =>
      updatePolicyCreateVersionBodySchema.parse({
        versionNumber: '1.1',
        content: '',
      }),
    ).toThrow();
  });

  it('rejects an invalid policy ID and unknown fields', () => {
    expect(() => updatePolicyCreateVersionParamsSchema.parse({ policyId: 'bad' })).toThrow();
    expect(() =>
      updatePolicyCreateVersionBodySchema.parse({
        versionNumber: '1.1',
        content: 'Content',
        changeSummary: 'Summary',
        status: 'published',
      }),
    ).toThrow();
  });
});
