import { describe, expect, it } from 'vitest';
import { listAuditLogsQuerySchema } from '../src/modules/audit-security-reporting/dto/list-audit-logs.dto.js';

describe('audit logs DTO validation', () => {
  describe('listAuditLogsQuerySchema', () => {
    it('applies default pagination and sort options', () => {
      const parsed = listAuditLogsQuerySchema.parse({});
      expect(parsed).toEqual({
        page: 1,
        limit: 20,
        sortBy: 'occurredAt',
        sortOrder: 'desc',
      });
    });

    it('accepts valid query options', () => {
      const parsed = listAuditLogsQuerySchema.parse({
        page: '2',
        limit: '50',
        sortBy: 'action',
        sortOrder: 'asc',
      });
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);
      expect(parsed.sortBy).toBe('action');
      expect(parsed.sortOrder).toBe('asc');
    });

    it('rejects invalid limit exceeding 100', () => {
      expect(() =>
        listAuditLogsQuerySchema.parse({ limit: '150' }),
      ).toThrow();
    });
  });
});
