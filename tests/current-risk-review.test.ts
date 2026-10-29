import { expect, it } from 'vitest';
import { currentRiskReview } from '../src/modules/risk-assessment/current-risk-review.js';
const opened = { action: 'RISK_REVIEW_OPENED', occurred_at: new Date('2026-10-27T00:00:00Z'), after_data: { reason: 'Periodic review', openedBy: 'owner', openedByName: 'Owner', previousReviewDate: '2026-10-16T00:00:00.000Z' } };
it('preserves the immutable opening snapshot', () => {
  expect(currentRiskReview([opened])).toMatchObject({ openedByName: 'Owner', previousReviewDate: '2026-10-16T00:00:00.000Z', reason: 'Periodic review' });
});
it('does not invent missing legacy fields', () => {
  expect(currentRiskReview([{ ...opened, after_data: { reason: 'Old event' } }])).toMatchObject({ openedByName: null, previousReviewDate: null, reason: 'Old event' });
});
it('rejection keeps review open; approval or completion ends the prior cycle', () => {
  const decision = { action: 'RISK_ACCEPTANCE_DECIDED', occurred_at: new Date(), after_data: { decision: 'REJECTED' } };
  expect(currentRiskReview([decision, opened])).not.toBeNull();
  expect(currentRiskReview([{ ...decision, after_data: { decision: 'APPROVED' } }, opened])).toBeNull();
  expect(currentRiskReview([{ ...decision, action: 'RISK_REVIEW_COMPLETED' }, opened])).toBeNull();
  expect(currentRiskReview([])).toBeNull();
});
