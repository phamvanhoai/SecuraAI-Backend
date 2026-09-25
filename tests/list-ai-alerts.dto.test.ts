import { describe, expect, it } from 'vitest';
import { listAiAlertsQuerySchema } from '../src/modules/ai-anomaly-detection-alerts/dto/list-ai-alerts.dto.js';

describe('list AI alerts query', () => {
  it('applies bounded pagination defaults', () => {
    expect(listAiAlertsQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 20,
      sortOrder: 'desc',
    });
  });

  it('parses a real-time watermark and rejects unbounded input', () => {
    const parsed = listAiAlertsQuerySchema.parse({ detectedAfter: '2026-09-25T00:00:00Z' });
    expect(parsed.detectedAfter).toEqual(new Date('2026-09-25T00:00:00Z'));
    expect(listAiAlertsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listAiAlertsQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  });
});
