import { describe, expect, it } from 'vitest';
import { updateTreatmentPlanBodySchema } from './update-treatment-plan.dto.js';

const valid = {
  expectedUpdatedAt: '2026-09-21T01:00:00.000Z',
  strategy: 'mitigate' as const,
  description: 'Reduce unauthorized access to the service.',
  ownerUserId: '00000000-0000-4000-8000-000000000002',
  targetDate: '2026-10-31',
  actions: [{ id: '00000000-0000-4000-8000-000000000004', title: 'Enable MFA', assignedToUserId: '00000000-0000-4000-8000-000000000003', dueDate: '2026-10-15' }],
};

describe('updateTreatmentPlanBodySchema', () => {
  it('accepts existing actions', () => expect(updateTreatmentPlanBodySchema.parse(valid).actions).toHaveLength(1));
  it('rejects an empty mitigation plan', () => expect(() => updateTreatmentPlanBodySchema.parse({ ...valid, actions: [] })).toThrow());
  it('rejects duplicate action identifiers', () => expect(() => updateTreatmentPlanBodySchema.parse({ ...valid, actions: [valid.actions[0], valid.actions[0]] })).toThrow());
});
