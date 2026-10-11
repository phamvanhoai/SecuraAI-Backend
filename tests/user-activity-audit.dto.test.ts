import { describe, expect, it } from 'vitest';
import { listUserActivityAuditQuerySchema } from '../src/modules/audit-security-reporting/dto/list-user-activity-audit.dto.js';

describe('list user activity audit DTO', () => {
  it('normalizes bounded filters', () => {
    expect(
      listUserActivityAuditQuerySchema.parse({
        page: '2',
        limit: '50',
        q: '  policy  ',
        outcome: 'DENIED',
      }),
    ).toEqual({ page: 2, limit: 50, q: 'policy', outcome: 'DENIED' });
  });

  it.each([{ page: 0 }, { limit: 101 }, { outcome: 'PENDING' }, { unknown: 'value' }])(
    'rejects invalid query %#',
    (query) => expect(listUserActivityAuditQuerySchema.safeParse(query).success).toBe(false),
  );
});
