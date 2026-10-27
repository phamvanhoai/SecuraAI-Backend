export function vietnamDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
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
