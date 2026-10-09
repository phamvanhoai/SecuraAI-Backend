import { describe, expect, it } from 'vitest';
import {
  getEventGovernancePolicyParamsSchema,
  listEventGovernancePoliciesQuerySchema,
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
});
