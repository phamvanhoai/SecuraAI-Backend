import { describe, expect, it } from 'vitest';
import { createTreatmentPlanBodySchema } from '../src/modules/risk-assessment/dto/create-treatment-plan.dto.js';

const id = '11111111-1111-4111-8111-111111111111';
describe('create treatment plan DTO', () => {
  const base = { riskId: id, title: 'Plan example', strategy: 'accept', ownerUserId: id, targetDate: '2027-12-31', targetRisk: 'low', controlIds: [], actions: [], acceptanceCost: { costToFix: '100000000', expectedLoss: '5000000', currency: 'VND', periodMonths: 12, basis: 'Synthetic twelve month comparison including one-time and operating costs.' } };
  it('allows non-mitigation plans without controls', () => expect(createTreatmentPlanBodySchema.safeParse(base).success).toBe(true));
  it('rejects duplicated controls', () => expect(createTreatmentPlanBodySchema.safeParse({ ...base, controlIds: [id, id] }).success).toBe(false));
  it('rejects duplicated action titles', () => {
    const action = { title: 'Test backup', assignedToUserId: id, dueDate: '2027-10-31' };
    expect(createTreatmentPlanBodySchema.safeParse({ ...base, actions: [action, { ...action, title: 'TEST BACKUP' }] }).success).toBe(false);
  });
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
