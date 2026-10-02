import { describe, expect, it } from 'vitest';
import {
  policyVersionHistoryParamsSchema,
  policyVersionHistoryQuerySchema,
} from '../src/modules/policy-compliance-control/dto/policy-version-history.dto.js';

describe('policy version history DTOs', () => {
  it('applies bounded list defaults', () => {
    expect(policyVersionHistoryQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      status: 'all',
    });
  });

  it('accepts published history filters', () => {
    expect(
      policyVersionHistoryQuerySchema.parse({
        page: '2',
        limit: '10',
        q: 'access',
        status: 'archived',
      }),
    ).toEqual({ page: 2, limit: 10, q: 'access', status: 'archived' });
  });

  it('rejects draft filters and invalid identifiers', () => {
    expect(() => policyVersionHistoryQuerySchema.parse({ status: 'draft' })).toThrow();
    expect(() =>
      policyVersionHistoryParamsSchema.parse({ policyId: 'bad', versionId: 'bad' }),
    ).toThrow();
  });
});
