import { describe, expect, it } from 'vitest';
import { createPolicyDraftBodySchema } from '../src/modules/policy-compliance-control/dto/create-policy-draft.dto.js';

describe('create policy draft DTO', () => {
  it('normalizes a valid request', () => {
    expect(
      createPolicyDraftBodySchema.parse({
        policyCode: ' isp-001 ',
        title: ' Information security policy ',
        description: ' Initial policy ',
        versionNumber: ' 1.0 ',
        content: ' Policy content ',
      }),
    ).toEqual({
      policyCode: 'ISP-001',
      title: 'Information security policy',
      description: 'Initial policy',
      versionNumber: '1.0',
      content: 'Policy content',
    });
  });

  it('rejects unknown fields and invalid policy codes', () => {
    expect(
      createPolicyDraftBodySchema.safeParse({
        policyCode: 'invalid code',
        title: 'Information security policy',
        versionNumber: '1.0',
        content: 'Policy content',
        status: 'PUBLISHED',
      }).success,
    ).toBe(false);
  });
});
