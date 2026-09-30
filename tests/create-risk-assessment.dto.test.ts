import { describe, expect, it } from 'vitest';
import { createRiskAssessmentBodySchema } from '../src/modules/risk-assessment/dto/create-risk-assessment.dto.js';

const valid = {
  title: 'Unauthorized access to customer data',
  description: 'Customer records may be exposed through a compromised application account.',
  ownerUserId: '00000000-0000-4000-8000-000000000001',
  reviewDate: '2027-01-15',
  scope: { type: 'asset', assetId: '00000000-0000-4000-8000-000000000002' },
  threats: [{ name: 'Credential theft' }],
  vulnerabilities: [{ name: 'Weak access controls' }],
  inherentLikelihood: 4,
  inherentImpact: 5,
  controlEffectiveness: 45,
  residualLikelihood: 3,
  residualImpact: 4,
  targetRisk: 'low',
  assessmentReason: 'Initial assessment based on the current control environment.',
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

  it('rejects duplicate threat names and invalid scores', () => {
    const result = createRiskAssessmentBodySchema.safeParse({
      ...valid,
      inherentLikelihood: 6,
      threats: [{ name: 'Phishing' }, { name: ' phishing ' }],
    });
    expect(result.success).toBe(false);
  });
});
