import { describe, expect, it } from 'vitest';
import { createRiskAssessmentBodySchema } from '../src/modules/risk-assessment/dto/create-risk-assessment.dto.js';

const valid = {
  title: 'Unauthorized access to customer data',
  description: 'Customer records may be exposed through a compromised application account.',
  ownerUserId: '00000000-0000-4000-8000-000000000001',
  reviewDate: '2027-01-15',
  scope: { type: 'asset', assetId: '00000000-0000-4000-8000-000000000002' },
} as const;

describe('create risk assessment contract', () => {
  it('accepts an asset assessment', () => {
    expect(createRiskAssessmentBodySchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a business service scope', () => {
    expect(createRiskAssessmentBodySchema.safeParse({
      ...valid,
      scope: { type: 'business_service', businessServiceId: '00000000-0000-4000-8000-000000000003' },
    }).success).toBe(true);
  });

  it('rejects evaluation data owned by later workflow steps', () => {
    const result = createRiskAssessmentBodySchema.safeParse({
      ...valid,
      inherentLikelihood: 6,
    });
    expect(result.success).toBe(false);
  });
});
