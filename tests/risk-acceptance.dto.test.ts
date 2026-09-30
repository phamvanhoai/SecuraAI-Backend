import { describe, expect, it } from 'vitest';
import { decideRiskAcceptanceBodySchema, submitRiskAcceptanceBodySchema } from '../src/modules/risk-assessment/dto/risk-acceptance.dto.js';
const id = '11111111-1111-4111-8111-111111111111';
describe('risk acceptance DTOs', () => {
  it('accepts a reassessment and acceptance request', () => expect(submitRiskAcceptanceBodySchema.safeParse({ residualLikelihood: 2, residualImpact: 3, assessmentReason: 'Controls reduced the observed exposure.', treatmentPlanId: id, treatmentPlanStatus: 'active', validUntil: '2027-12-31', acceptanceReason: 'Residual exposure is within approved tolerance.' }).success).toBe(true));
  it('rejects residual scores outside 1 to 5', () => expect(submitRiskAcceptanceBodySchema.safeParse({ residualLikelihood: 6, residualImpact: 3, assessmentReason: 'Controls reduced the observed exposure.', treatmentPlanId: id, treatmentPlanStatus: 'active', validUntil: '2027-12-31', acceptanceReason: 'Residual exposure is within approved tolerance.' }).success).toBe(false));
  it('requires a reason for the approver decision', () => expect(decideRiskAcceptanceBodySchema.safeParse({ decision: 'approved', reason: 'short' }).success).toBe(false));
});
