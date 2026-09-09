import { describe, expect, it } from 'vitest';
import {
  publishPolicyVersionBodySchema,
  publishPolicyVersionParamsSchema,
} from '../src/modules/policy-compliance/dto/publish-policy-version.dto.js';

describe('publish policy version DTO', () => {
  it('accepts UUID parameters and an optional effective date', () => {
    expect(
      publishPolicyVersionParamsSchema.parse({
        policyId: '00000000-0000-4000-8000-000000000010',
        versionId: '00000000-0000-4000-8000-000000000011',
      }),
    ).toBeDefined();
    expect(publishPolicyVersionBodySchema.parse({ effectiveDate: '2026-09-09' })).toEqual({
      effectiveDate: '2026-09-09',
    });
    expect(publishPolicyVersionBodySchema.parse({})).toEqual({});
  });

  it('rejects invalid IDs, invalid dates, and unsupported fields', () => {
    expect(() =>
      publishPolicyVersionParamsSchema.parse({ policyId: 'bad', versionId: 'bad' }),
    ).toThrow();
    expect(() => publishPolicyVersionBodySchema.parse({ effectiveDate: '2026-02-30' })).toThrow();
    expect(() => publishPolicyVersionBodySchema.parse({ status: 'published' })).toThrow();
  });
});
