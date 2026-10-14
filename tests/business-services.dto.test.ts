import { describe, expect, it } from 'vitest';
import {
  businessServiceParamsSchema,
  listBusinessServicesQuerySchema,
  servicePageQuerySchema,
} from '../src/modules/it-asset-management/dto/list-business-services.dto.js';

describe('business service read boundaries', () => {
  it('defaults to a bounded all-status list and trims search', () => {
    expect(listBusinessServicesQuerySchema.parse({ q: '  support  ' })).toEqual({
      page: 1,
      limit: 10,
      q: 'support',
    });
  });
  it.each([
    { page: 0 },
    { page: 100001 },
    { page: 1.5 },
    { limit: 101 },
    { limit: -1 },
    { q: ' ' },
    { q: 'a'.repeat(101) },
    { status: 'archived' },
    { sortBy: 'password' },
  ])('rejects invalid filters %j', (input) => {
    expect(listBusinessServicesQuerySchema.safeParse(input).success).toBe(false);
  });
  it('rejects malformed IDs and unsupported linked-asset filters', () => {
    expect(businessServiceParamsSchema.safeParse({ serviceId: '../users' }).success).toBe(false);
    expect(servicePageQuerySchema.safeParse({ status: 'active' }).success).toBe(false);
  });
});
