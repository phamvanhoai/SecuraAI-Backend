import { describe, expect, it } from 'vitest';
import {
  policyDraftReviewParamsSchema,
  reviewablePolicyDraftQuerySchema,
} from '../src/modules/policy-compliance-control/dto/view-policy-draft.dto.js';

describe('view policy draft DTOs', () => {
  it('bounds and defaults the reviewable draft query', () => {
    expect(reviewablePolicyDraftQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(reviewablePolicyDraftQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('requires UUID policy and version identifiers', () => {
    expect(
      policyDraftReviewParamsSchema.safeParse({ policyId: 'invalid', versionId: 'invalid' })
        .success,
    ).toBe(false);
  });
});
