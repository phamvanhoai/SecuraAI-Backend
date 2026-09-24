import { describe, expect, it } from 'vitest';
import { listPolicyVersionHistoryQuerySchema } from './policy-version-history.dto.js';

describe('listPolicyVersionHistoryQuerySchema', () => {
  it('applies bounded pagination defaults', () => {
    expect(listPolicyVersionHistoryQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      status: 'all',
    });
  });

  it('rejects unsupported statuses and oversized pages', () => {
    expect(() => listPolicyVersionHistoryQuerySchema.parse({ status: 'deleted' })).toThrow();
    expect(() => listPolicyVersionHistoryQuerySchema.parse({ limit: 101 })).toThrow();
  });
});
