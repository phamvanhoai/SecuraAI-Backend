import { describe, expect, it } from 'vitest';
import { createTreatmentPlanBodySchema } from './create-treatment-plan.dto.js';

const valid = {
  riskAssessmentId: '7cb17b2b-d648-40b4-98fa-793fed80d3ff',
  expectedRiskUpdatedAt: '2026-09-21T08:00:00.000Z',
  strategy: 'mitigate',
  description: 'Apply layered controls to reduce unauthorized access risk.',
  ownerUserId: '13e3cb08-027b-49f5-968a-b6f52bb71fdb',
  targetDate: '2026-10-30',
  actions: [
    {
      title: 'Enable multi-factor authentication',
      assignedToUserId: '13e3cb08-027b-49f5-968a-b6f52bb71fdb',
      dueDate: '2026-10-20',
    },
  ],
};

describe('createTreatmentPlanBodySchema', () => {
  it('accepts and normalizes a valid plan', () => {
    expect(createTreatmentPlanBodySchema.parse(valid).actions).toHaveLength(1);
  });

  it('requires actions for non-accept strategies', () => {
    expect(() => createTreatmentPlanBodySchema.parse({ ...valid, actions: [] })).toThrow();
  });

  it('rejects duplicate actions and due dates after the target', () => {
    expect(() =>
      createTreatmentPlanBodySchema.parse({
        ...valid,
        actions: [valid.actions[0], { ...valid.actions[0], dueDate: '2026-11-01' }],
      }),
    ).toThrow();
  });
});
