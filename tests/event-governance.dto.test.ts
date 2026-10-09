import { describe, expect, it } from 'vitest';
import {
  getEventGovernancePolicyParamsSchema,
  listEventGovernancePoliciesQuerySchema,
  updateEventGovernancePolicySchema,
} from '../src/modules/event-ingestion/dto/event-governance-policy.dto.js';

describe('event governance policy DTO validation', () => {
  describe('listEventGovernancePoliciesQuerySchema', () => {
    it('applies default pagination and sorting', () => {
      const parsed = listEventGovernancePoliciesQuerySchema.parse({});
      expect(parsed).toEqual({
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    });

    it('validates and parses valid query filters', () => {
      const parsed = listEventGovernancePoliciesQuerySchema.parse({
        page: '2',
        limit: '50',
        search: 'auth retention',
        eventFamily: 'AUTHENTICATION',
        status: 'ACTIVE',
        sortBy: 'retentionDays',
        sortOrder: 'asc',
      });

      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);
      expect(parsed.search).toBe('auth retention');
      expect(parsed.eventFamily).toBe('AUTHENTICATION');
      expect(parsed.status).toBe('ACTIVE');
      expect(parsed.sortBy).toBe('retentionDays');
      expect(parsed.sortOrder).toBe('asc');
    });

    it('rejects invalid eventFamily', () => {
      expect(() =>
        listEventGovernancePoliciesQuerySchema.parse({ eventFamily: 'INVALID_FAMILY' }),
      ).toThrow();
    });

    it('rejects invalid status', () => {
      expect(() =>
        listEventGovernancePoliciesQuerySchema.parse({ status: 'ARCHIVED' }),
      ).toThrow();
    });

    it('rejects limit exceeding 100', () => {
      expect(() =>
        listEventGovernancePoliciesQuerySchema.parse({ limit: 101 }),
      ).toThrow();
    });
  });

  describe('getEventGovernancePolicyParamsSchema', () => {
    it('accepts valid UUID', () => {
      const parsed = getEventGovernancePolicyParamsSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(parsed.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('rejects non-uuid format', () => {
      expect(() =>
        getEventGovernancePolicyParamsSchema.parse({ id: 'not-a-uuid' }),
      ).toThrow();
    });
  });

  describe('updateEventGovernancePolicySchema', () => {
    it('validates partial update payload correctly', () => {
      const parsed = updateEventGovernancePolicySchema.parse({
        retentionDays: 180,
        archiveAfterDays: 60,
        deletionEnabled: true,
        exportAllowed: false,
        status: 'ACTIVE',
        maskingRules: { maskIp: true },
      });

      expect(parsed.retentionDays).toBe(180);
      expect(parsed.archiveAfterDays).toBe(60);
      expect(parsed.deletionEnabled).toBe(true);
      expect(parsed.exportAllowed).toBe(false);
      expect(parsed.status).toBe('ACTIVE');
    });

    it('rejects archiveAfterDays greater than or equal to retentionDays in schema', () => {
      expect(() =>
        updateEventGovernancePolicySchema.parse({
          retentionDays: 90,
          archiveAfterDays: 90,
        }),
      ).toThrow(/Cold archival threshold.*less than retention period/i);

      expect(() =>
        updateEventGovernancePolicySchema.parse({
          retentionDays: 90,
          archiveAfterDays: 120,
        }),
      ).toThrow(/Cold archival threshold.*less than retention period/i);
    });

    it('rejects invalid retention days range (less than 1 or exceeding 3650)', () => {
      expect(() =>
        updateEventGovernancePolicySchema.parse({ retentionDays: 0 }),
      ).toThrow();

      expect(() =>
        updateEventGovernancePolicySchema.parse({ retentionDays: 5000 }),
      ).toThrow();
    });
  });
});
