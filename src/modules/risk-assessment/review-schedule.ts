export function vietnamDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const OVERDUE_REVIEW_SUBMIT_MESSAGE =
  'This Risk is overdue for review. Open and complete Risk Review before submitting an acceptance request.';
export const OVERDUE_REVIEW_APPROVAL_MESSAGE =
  'This Risk is overdue for review. Reject this request so the Risk Owner can open and complete Risk Review, then submit a new acceptance request.';

export function riskReviewOverdue(reviewDate: Date | null | undefined, now = new Date()): boolean {
  // review_date is a calendar date stored as UTC midnight, not an instant deadline.
  return Boolean(reviewDate && reviewDate.toISOString().slice(0, 10) < vietnamDate(now));
}
export function reviewDeadline(today: string, rating: string): string {
  const months: Record<string, number> = { CRITICAL: 1, HIGH: 3, MEDIUM: 6, LOW: 12 };
  const count = months[rating];
  if (!count) throw new Error('Unknown residual rating');
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}
