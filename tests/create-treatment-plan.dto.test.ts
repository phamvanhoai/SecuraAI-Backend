import { describe, expect, it } from 'vitest';
import { createTreatmentPlanBodySchema } from '../src/modules/risk-assessment/dto/create-treatment-plan.dto.js';

const id = '11111111-1111-4111-8111-111111111111';
describe('create treatment plan DTO', () => {
  it('accepts a complete mitigation plan', () => {
    expect(createTreatmentPlanBodySchema.safeParse({ riskId: id, title: 'Reduce phishing exposure', strategy: 'mitigate', ownerUserId: id, targetDate: '2027-12-31', targetRisk: 'low', controlIds: [id], actions: [{ title: 'Deploy phishing-resistant MFA', assignedToUserId: id, dueDate: '2027-10-31' }] }).success).toBe(true);
  });
  it('requires actions unless the risk is accepted', () => {
    const result = createTreatmentPlanBodySchema.safeParse({ riskId: id, title: 'Reduce phishing exposure', strategy: 'mitigate', ownerUserId: id, targetDate: '2027-12-31', targetRisk: 'low', controlIds: [id], actions: [] });
    expect(result.success).toBe(false);
  });
  it('rejects action dates after the plan date', () => {
    const result = createTreatmentPlanBodySchema.safeParse({ riskId: id, title: 'Reduce phishing exposure', strategy: 'mitigate', ownerUserId: id, targetDate: '2027-10-01', targetRisk: 'low', controlIds: [id], actions: [{ title: 'Deploy phishing-resistant MFA', assignedToUserId: id, dueDate: '2027-10-31' }] });
    expect(result.success).toBe(false);
  });
});
