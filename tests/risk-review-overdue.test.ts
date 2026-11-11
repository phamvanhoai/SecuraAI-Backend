import { expect, it } from 'vitest';
import { riskReviewOverdue } from '../src/modules/risk-assessment/review-schedule.js';

it.each([
  ['2026-11-08', '2026-11-09T05:00:00Z', true],
  ['2026-11-09', '2026-11-09T05:00:00Z', false],
  ['2026-11-10', '2026-11-09T05:00:00Z', false],
  ['2026-11-09', '2026-11-09T16:59:59Z', false],
  ['2026-11-09', '2026-11-09T17:00:00Z', true],
] as const)('review %s at %s is overdue: %s', (day, now, overdue) => {
  expect(riskReviewOverdue(new Date(`${day}T00:00:00Z`), new Date(now))).toBe(overdue);
});
it('does not treat an unscheduled review as overdue', () => {
  expect(riskReviewOverdue(null)).toBe(false);
});
