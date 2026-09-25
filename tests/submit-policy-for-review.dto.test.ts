import { describe, expect, it } from 'vitest';
import { submitPolicyForReviewParamsSchema } from '../src/modules/policy-compliance-control/dto/submit-policy-for-review.dto.js';

describe('submit policy for review DTO', () => {
  it('accepts valid policy and version identifiers', () => {
    expect(
      submitPolicyForReviewParamsSchema.safeParse({
        policyId: 'f249f96c-7a87-47e2-a6fd-2bebc29294c5',
        versionId: 'ec178d52-2959-47fd-93db-aa693158668c',
      }).success,
    ).toBe(true);
  });

  it('rejects malformed identifiers', () => {
    expect(
      submitPolicyForReviewParamsSchema.safeParse({ policyId: 'invalid', versionId: 'invalid' })
        .success,
    ).toBe(false);
  });
});
