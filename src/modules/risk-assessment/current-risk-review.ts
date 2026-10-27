type ReviewEvent = { action: string; occurred_at: Date; after_data: unknown };

/** Events are supplied newest first. Legacy approval ends its earlier reopened review. */
export function currentRiskReview(events: readonly ReviewEvent[]) {
  for (const event of events) {
    const data = event.after_data;
    const record = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    if (event.action === 'RISK_REVIEW_COMPLETED' ||
        (event.action === 'RISK_ACCEPTANCE_DECIDED' && record && 'decision' in record && record.decision === 'APPROVED')) return null;
    if (event.action !== 'RISK_REVIEW_OPENED') continue;
    const text = (key: string): string | null => {
      if (!record || !(key in record)) return null;
      const value: unknown = Reflect.get(record, key);
      return typeof value === 'string' ? value : null;
    };
    return { openedAt: event.occurred_at, openedBy: text('openedBy'), openedByName: text('openedByName'),
      previousReviewDate: text('previousReviewDate'), reason: text('reason') };
  }
  return null;
}
