import { describe, expect, it } from 'vitest';
import { complianceReminderQuerySchema } from './compliance-reminder.dto.js';
describe('complianceReminderQuerySchema', () => {
  it('applies safe inbox defaults', () =>
    expect(complianceReminderQuerySchema.parse({})).toEqual({ page: 1, limit: 10, status: 'all' }));
  it('rejects unbounded queries', () =>
    expect(complianceReminderQuerySchema.safeParse({ limit: 51 }).success).toBe(false));
});
