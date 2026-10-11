import { describe, expect, it } from 'vitest';
import {
  configureRolePermissionsBodySchema,
  configureUserPermissionsBodySchema,
} from '../src/modules/access-control/dto/role-permissions.dto.js';

const permissionId = '6f9619ff-8b86-4d1f-8a93-39e3e6123456';

describe('detailed permission DTOs', () => {
  it('accepts a bounded role permission replacement with an audit reason', () => {
    expect(
      configureRolePermissionsBodySchema.parse({
        permissionIds: [permissionId],
        expectedUpdatedAt: '2026-10-03T00:00:00.000Z',
        reason: 'Limit this role to its approved operating duties.',
      }),
    ).toMatchObject({ permissionIds: [permissionId] });
  });

  it('rejects the same user permission in allow and deny', () => {
    expect(
      configureUserPermissionsBodySchema.safeParse({
        allow: [permissionId],
        deny: [permissionId],
        reason: 'Temporary access exception for investigation.',
      }).success,
    ).toBe(false);
  });
});
