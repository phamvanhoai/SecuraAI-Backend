import { describe, expect, it } from 'vitest';
import { createPolicyDraftSchema } from '../src/modules/policy-compliance/dto/create-policy-draft.dto.js';

describe('createPolicyDraftSchema', () => {
  it('normalizes the policy code and applies the initial version default', () => {
    const result = createPolicyDraftSchema.parse({
      policyCode: ' isp-001 ',
      title: ' Information Security Policy ',
      content: ' Policy content ',
    });

    expect(result).toEqual({
      policyCode: 'ISP-001',
      title: 'Information Security Policy',
      versionNumber: '1.0',
      content: 'Policy content',
    });
  });

  it('rejects unsupported fields and invalid policy codes', () => {
    expect(() =>
      createPolicyDraftSchema.parse({
        policyCode: 'invalid code',
        title: 'Information Security Policy',
        content: 'Policy content',
        status: 'published',
      }),
    ).toThrow();
  });
});
