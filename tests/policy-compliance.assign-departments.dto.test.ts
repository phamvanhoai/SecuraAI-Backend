import { describe, expect, it } from 'vitest';
import {
  assignPolicyDepartmentsBodySchema,
  listPolicyDepartmentAssignmentsQuerySchema,
} from '../src/modules/policy-compliance/dto/assign-policy-departments.dto.js';

describe('assign policy departments DTO', () => {
  it('deduplicates valid department IDs', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(assignPolicyDepartmentsBodySchema.parse({ departmentIds: [id, id] })).toEqual({
      departmentIds: [id],
    });
  });

  it('accepts an empty selection and bounds list queries', () => {
    expect(assignPolicyDepartmentsBodySchema.parse({ departmentIds: [] })).toEqual({
      departmentIds: [],
    });
    expect(listPolicyDepartmentAssignmentsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(() => listPolicyDepartmentAssignmentsQuerySchema.parse({ limit: 101 })).toThrow();
  });
});
