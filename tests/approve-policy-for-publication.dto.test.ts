import { describe, expect, it } from 'vitest';
import { approvePolicyForPublicationParamsSchema } from '../src/modules/policy-compliance-control/dto/approve-policy-for-publication.dto.js';

describe('approve policy for publication DTO', () => {
  it('accepts UUID identifiers and rejects unknown parameters', () => {
    const params = {
      policyId: 'cc641a6e-6c63-4cf0-b626-34307fb36a88',
      versionId: 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8',
    };
    expect(approvePolicyForPublicationParamsSchema.safeParse(params).success).toBe(true);
    expect(
      approvePolicyForPublicationParamsSchema.safeParse({ ...params, status: 'APPROVED' }).success,
    ).toBe(false);
  });

  it('rejects invalid identifiers', () => {
    expect(
      approvePolicyForPublicationParamsSchema.safeParse({
        policyId: 'invalid',
        versionId: 'invalid',
      }).success,
    ).toBe(false);
  });
});
