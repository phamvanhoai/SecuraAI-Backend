import { describe, expect, it } from 'vitest';
import { listTreatmentPlansQuerySchema } from './list-treatment-plans-query.dto.js';

describe('listTreatmentPlansQuerySchema', () => {
  it('applies bounded pagination and default sorting', () => {
    expect(listTreatmentPlansQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 10,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(() => listTreatmentPlansQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it('validates filters and target date order', () => {
    expect(
      listTreatmentPlansQuerySchema.parse({
        status: 'in_progress',
        strategy: 'mitigate',
        overdue: 'true',
      }),
    ).toMatchObject({ status: 'in_progress', strategy: 'mitigate', overdue: true });
    expect(() =>
      listTreatmentPlansQuerySchema.parse({
        targetFrom: '2026-09-20',
        targetTo: '2026-09-19',
      }),
    ).toThrow();
  });
});
