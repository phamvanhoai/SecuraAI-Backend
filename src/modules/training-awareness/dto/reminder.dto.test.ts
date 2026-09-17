import { describe, expect, it } from 'vitest';
import { reminderQuerySchema } from './reminder.dto.js';
describe('reminder search boundary', () => {
  it('normalizes whitespace and preserves bounded defaults', () => {
    expect(reminderQuerySchema.parse({ search: ' Phishing ' })).toEqual({
      page: 1,
      limit: 10,
      status: 'all',
      search: 'Phishing',
    });
    expect(reminderQuerySchema.parse({ search: '  ' }).search).toBe('');
  });
  it('rejects excessive search length and non-string filters', () => {
    expect(reminderQuerySchema.safeParse({ search: 'x'.repeat(101) }).success).toBe(false);
    expect(reminderQuerySchema.safeParse({ search: ['one', 'two'] }).success).toBe(false);
  });
});
