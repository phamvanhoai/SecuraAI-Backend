import { describe, expect, it } from 'vitest';
import {
  requestPolicyRevisionBodySchema,
  requestPolicyRevisionParamsSchema,
} from '../src/modules/policy-compliance-control/dto/request-policy-revision.dto.js';

describe('request policy revision DTO', () => {
  it('trims a valid revision comment', () => {
    expect(requestPolicyRevisionBodySchema.parse({ comment: '  Clarify the access scope.  ' })).toEqual({
      comment: 'Clarify the access scope.',
    });
  });

  it('requires a meaningful comment and rejects unknown fields', () => {
    expect(requestPolicyRevisionBodySchema.safeParse({ comment: '  ' }).success).toBe(false);
    expect(
      requestPolicyRevisionBodySchema.safeParse({ comment: 'Revise this', status: 'DRAFT' }).success,
    ).toBe(false);
  });

  it('requires UUID route identifiers', () => {
    expect(
      requestPolicyRevisionParamsSchema.safeParse({ policyId: 'invalid', versionId: 'invalid' })
        .success,
    ).toBe(false);
  });
});
