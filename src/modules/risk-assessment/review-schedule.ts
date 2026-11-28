// Get the Vietnam calendar date as YYYY-MM-DD, regardless of the server timezone.
export function vietnamDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    // Use Vietnam time (UTC+7).
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
// Tell the Owner to finish the overdue review before sending a new acceptance request.
export const OVERDUE_REVIEW_SUBMIT_MESSAGE =
  'This Risk is overdue for review. Open and complete Risk Review before submitting an acceptance request.';
// Tell the Approver to reject the pending request so the Owner can review and submit again.
export const OVERDUE_REVIEW_APPROVAL_MESSAGE =
  'This Risk is overdue for review. Reject this request so the Risk Owner can open and complete Risk Review, then submit a new acceptance request.';

// A review is overdue only after its date has passed in Vietnam. No date means not overdue.
export function riskReviewOverdue(reviewDate: Date | null | undefined, now = new Date()): boolean {
  // review_date is a calendar date stored as UTC midnight, not an instant deadline.
  return Boolean(reviewDate && reviewDate.toISOString().slice(0, 10) < vietnamDate(now));
}
// Find the latest next-review date allowed by the internal Residual rating policy.
export function reviewDeadline(today: string, rating: string): string {
  // Review more often for higher risk: Critical 1, High 3, Medium 6 and Low 12 months.
  const months: Record<string, number> = { CRITICAL: 1, HIGH: 3, MEDIUM: 6, LOW: 12 };
  // Choose the number of months for the current Residual rating.
  const count = months[rating];
  // Stop if the supplied rating is not in the policy.
  if (!count) throw new Error('Unknown residual rating');
  // Use UTC methods to do calendar arithmetic on the Vietnam date, not to change its timezone.
  const date = new Date(`${today}T00:00:00Z`);
  // Remember the original day of the month, such as 31.
  const day = date.getUTCDate();
  // Start from day 1 so adding months cannot skip a shorter month.
  date.setUTCDate(1);
  // Move forward by the number of months required by the policy.
  date.setUTCMonth(date.getUTCMonth() + count);
  // Day 0 of the following month gives the last day of the target month.
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  // Keep the original day when possible; otherwise use the last day, such as 31 January to 28 February.
  date.setUTCDate(Math.min(day, last));
  // Return the calculated deadline as YYYY-MM-DD without a time.
  return date.toISOString().slice(0, 10);
}
