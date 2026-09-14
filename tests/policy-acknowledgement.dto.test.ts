import { describe, expect, it } from 'vitest';
import {
  employeePolicyQuerySchema,
  policyAcknowledgementParamsSchema,
} from '../src/modules/policy-compliance/dto/acknowledge-policy.dto.js';

describe('policy acknowledgement DTO', () => {
  it('uses bounded defaults', () => {
    expect(employeePolicyQuerySchema.parse({})).toEqual({ page: 1, limit: 20, status: 'all' });
    expect(() => employeePolicyQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it('rejects invalid identifiers and statuses', () => {
    expect(() =>
      policyAcknowledgementParamsSchema.parse({ policyId: 'bad', versionId: 'bad' }),
    ).toThrow();
    expect(() => employeePolicyQuerySchema.parse({ status: 'unknown' })).toThrow();
  });
});
