import { describe, expect, it } from 'vitest';
import { definePolicyApplicabilityBodySchema } from '../src/modules/policy-compliance-control/dto/define-policy-applicability.dto.js';

describe('define policy applicability DTO', () => {
  it('normalizes duplicate targets', () => {
    const id = '773d8356-e68c-421b-9ce3-29ea4601970f';
    const result = definePolicyApplicabilityBodySchema.parse({
      departmentIds: [id, id],
      roleCodes: ['EMPLOYEE', 'EMPLOYEE'],
      rationale: 'Employees handle information covered by this policy.',
      referenceBasis: 'ISO/IEC 27001 control framework',
    });
    expect(result.departmentIds).toEqual([id]);
    expect(result.roleCodes).toEqual(['EMPLOYEE']);
  });

  it('requires at least one scope target and a meaningful rationale', () => {
    expect(
      definePolicyApplicabilityBodySchema.safeParse({ rationale: 'short', referenceBasis: 'ISO' })
        .success,
    ).toBe(false);
  });
});
