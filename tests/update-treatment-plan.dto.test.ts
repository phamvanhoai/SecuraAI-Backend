import { describe, expect, it } from 'vitest';
import { updateTreatmentPlanBodySchema } from '../src/modules/risk-assessment/dto/update-treatment-plan.dto.js';
const id = '11111111-1111-4111-8111-111111111111';
const valid = { title: 'Reduce phishing exposure', strategy: 'mitigate', ownerUserId: id, targetDate: '2027-12-31', status: 'active', expectedUpdatedAt: '2026-09-29T10:00:00.000Z', actions: [{ id, title: 'Deploy MFA', assignedToUserId: id, dueDate: '2027-10-31', status: 'in_progress' }] };
describe('update treatment plan DTO', () => {
  it('accepts owner, dates, status and action progress', () => expect(updateTreatmentPlanBodySchema.safeParse(valid).success).toBe(true));
  it('rejects actions beyond the target date', () => expect(updateTreatmentPlanBodySchema.safeParse({ ...valid, actions: [{ ...valid.actions[0], dueDate: '2028-01-01' }] }).success).toBe(false));
});
