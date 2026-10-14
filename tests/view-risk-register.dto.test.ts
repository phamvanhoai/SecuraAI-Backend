import { describe, expect, it } from 'vitest';
import {
  listRiskRegisterQuerySchema,
  riskIdParamsSchema,
} from '../src/modules/risk-assessment/dto/view-risk-register.dto.js';

describe('risk register DTOs', () => {
  it('applies bounded pagination and sorting defaults', () => {
    expect(listRiskRegisterQuerySchema.parse({ q: ' access ' })).toMatchObject({
      page: 1,
      limit: 10,
      q: 'access',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
  });
  it('rejects invalid filters and identifiers', () => {
    expect(listRiskRegisterQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(
      listRiskRegisterQuerySchema.safeParse({ reviewFrom: '2026-10-02', reviewTo: '2026-10-01' })
        .success,
    ).toBe(false);
    expect(riskIdParamsSchema.safeParse({ riskId: '../risk' }).success).toBe(false);
  });
});
