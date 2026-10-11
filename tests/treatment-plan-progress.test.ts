import { describe, expect, it } from 'vitest';
import { calculateTreatmentPlanProgress } from '../src/modules/risk-assessment/treatment-plan-progress.js';

describe('treatment plan progress', () => {
  it.each([
    ['no actions', [], 0],
    ['pending actions', [{ status: 'PENDING' as const }], 0],
    ['in-progress actions', [{ status: 'IN_PROGRESS' as const }], 50],
    ['completed actions', [{ status: 'COMPLETED' as const }], 100],
    ['mixed actions', [{ status: 'PENDING' as const }, { status: 'IN_PROGRESS' as const }, { status: 'COMPLETED' as const }], 50],
    ['cancelled actions only', [{ status: 'CANCELLED' as const }], 0],
    ['cancelled actions excluded', [{ status: 'IN_PROGRESS' as const }, { status: 'CANCELLED' as const }], 50],
  ])('calculates %s consistently', (_case, actions, expected) => {
    expect(calculateTreatmentPlanProgress(actions)).toBe(expected);
  });
});
