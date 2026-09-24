import { describe, expect, it } from 'vitest';
import {
  createRoleBodySchema,
  listRolesQuerySchema,
  updateRoleBodySchema,
} from '../src/modules/access-control/dto/role.dto.js';
import { listPermissionsQuerySchema } from '../src/modules/access-control/dto/permission.dto.js';

describe('role DTOs', () => {
  it('bounds and normalizes permission catalog queries', () => {
    expect(listPermissionsQuerySchema.parse({ module: 'access-control' })).toEqual({
      page: 1,
      limit: 100,
      module: 'access-control',
      sortBy: 'code',
      sortOrder: 'asc',
    });
    expect(listPermissionsQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
  });
  it('normalizes pagination and accepts a unique permission set', () => {
    expect(listRolesQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(
      createRoleBodySchema.parse({
        code: 'RISK_REVIEWER',
        name: 'Risk Reviewer',
        permissionIds: [],
      }).code,
    ).toBe('RISK_REVIEWER');
  });
  it('rejects invalid codes, duplicate permissions and empty updates', () => {
    const id = '00000000-0000-4000-8000-000000000010';
    expect(createRoleBodySchema.safeParse({ code: 'risk admin', name: 'Risk Admin' }).success).toBe(
      false,
    );
    expect(
      createRoleBodySchema.safeParse({
        code: 'RISK_ADMIN',
        name: 'Risk Admin',
        permissionIds: [id, id],
      }).success,
    ).toBe(false);
    expect(updateRoleBodySchema.safeParse({}).success).toBe(false);
  });
});
