import { describe, expect, it } from 'vitest';
import { cancelTreatmentPlanBodySchema } from './cancel-treatment-plan.dto.js';

describe('cancelTreatmentPlanBodySchema', () => {
  const expectedUpdatedAt = '2026-09-21T01:00:00.000Z';

  it('normalizes a valid reason', () => {
    expect(
      cancelTreatmentPlanBodySchema.parse({
        expectedUpdatedAt,
        reason: '  Created   from the wrong assessment. ',
      }).reason,
    ).toBe('Created from the wrong assessment.');
  });

  it('rejects a short reason', () => {
    expect(() =>
      cancelTreatmentPlanBodySchema.parse({ expectedUpdatedAt, reason: 'mistake' }),
    ).toThrow();
  });
});
