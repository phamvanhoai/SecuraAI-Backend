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

    it('accepts valid search and filter query options', () => {
      const parsed = listAuditLogsQuerySchema.parse({
        page: '2',
        limit: '50',
        search: 'login failed',
        actor: 'admin@securaai.internal',
        actorType: 'USER',
        action: 'LOGIN_FAILURE',
        resourceType: 'users',
        correlationId: 'corr-999',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-08T23:59:59.000Z',
        sortBy: 'action',
        sortOrder: 'asc',
      });
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);
      expect(parsed.search).toBe('login failed');
      expect(parsed.actor).toBe('admin@securaai.internal');
      expect(parsed.actorType).toBe('USER');
      expect(parsed.action).toBe('LOGIN_FAILURE');
      expect(parsed.resourceType).toBe('users');
      expect(parsed.correlationId).toBe('corr-999');
      expect(parsed.startDate).toBe('2026-10-01T00:00:00.000Z');
      expect(parsed.endDate).toBe('2026-10-08T23:59:59.000Z');
      expect(parsed.sortBy).toBe('action');
      expect(parsed.sortOrder).toBe('asc');
    });

    it('rejects invalid actorType', () => {
      expect(() =>
        listAuditLogsQuerySchema.parse({ actorType: 'UNKNOWN_TYPE' }),
      ).toThrow();
    });

    it('rejects invalid limit exceeding 100', () => {
      expect(() =>
        listAuditLogsQuerySchema.parse({ limit: '150' }),
      ).toThrow();
    });
  });

  describe('getAuditLogParamsSchema', () => {
    it('accepts valid UUID id', async () => {
      const { getAuditLogParamsSchema } = await import(
        '../src/modules/audit-security-reporting/dto/list-audit-logs.dto.js'
      );
      const parsed = getAuditLogParamsSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(parsed.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('rejects non-uuid id', async () => {
      const { getAuditLogParamsSchema } = await import(
        '../src/modules/audit-security-reporting/dto/list-audit-logs.dto.js'
      );
      expect(() => getAuditLogParamsSchema.parse({ id: 'invalid-id' })).toThrow();
    });
  });

  describe('computePropertyChanges', () => {
    it('accurately identifies ADDED, MODIFIED, REMOVED, and UNCHANGED properties', async () => {
      const { computePropertyChanges } = await import(
        '../src/modules/audit-security-reporting/dto/list-audit-logs.dto.js'
      );

      const before = {
        role: 'EMPLOYEE',
        department: 'IT',
        tempNotes: 'to be deleted',
      };
      const after = {
        role: 'SECURITY_OFFICER',
        department: 'IT',
        permissions: ['read', 'write'],
      };

      const changes = computePropertyChanges(before, after);

      expect(changes).toEqual([
        { property: 'department', changeType: 'UNCHANGED', beforeValue: 'IT', afterValue: 'IT' },
        { property: 'permissions', changeType: 'ADDED', beforeValue: null, afterValue: ['read', 'write'] },
        { property: 'role', changeType: 'MODIFIED', beforeValue: 'EMPLOYEE', afterValue: 'SECURITY_OFFICER' },
        { property: 'tempNotes', changeType: 'REMOVED', beforeValue: 'to be deleted', afterValue: null },
      ]);
    });

    it('handles null states gracefully', async () => {
      const { computePropertyChanges } = await import(
        '../src/modules/audit-security-reporting/dto/list-audit-logs.dto.js'
      );

      expect(computePropertyChanges(null, null)).toEqual([]);
      expect(computePropertyChanges(null, { title: 'Policy A' })).toEqual([
        { property: 'title', changeType: 'ADDED', beforeValue: null, afterValue: 'Policy A' },
      ]);
      expect(computePropertyChanges({ title: 'Policy A' }, null)).toEqual([
        { property: 'title', changeType: 'REMOVED', beforeValue: 'Policy A', afterValue: null },
      ]);
    });
  });
});

