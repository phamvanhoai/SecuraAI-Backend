import { describe, expect, it } from 'vitest';
import { listPolicyDraftsQuerySchema } from '../src/modules/policy-compliance-control/dto/list-policy-drafts.dto.js';

describe('list policy drafts DTO', () => {
  it('applies bounded pagination and sorting defaults', () => {
    expect(listPolicyDraftsQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortOrder: 'desc',
    });
  });

  it('trims search text and rejects unknown or unbounded input', () => {
    expect(listPolicyDraftsQuerySchema.parse({ q: '  TEST  ' }).q).toBe('TEST');
    expect(listPolicyDraftsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listPolicyDraftsQuerySchema.safeParse({ unexpected: true }).success).toBe(false);
  });
});
