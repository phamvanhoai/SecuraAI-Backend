import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirstMock } = vi.hoisted(() => ({ findFirstMock: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { users: { findFirst: findFirstMock } },
}));

import { usersService } from '../src/modules/users/users.service.js';

describe('usersService.findMe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns unique sorted effective permissions from every assigned role', async () => {
    findFirstMock.mockResolvedValue({
      user_id: 'user-1',
      email: 'officer@securaai.local',
      full_name: 'Security Officer',
      phone: null,
      employee_code: 'SO-001',
      status: 'active',
      must_change_password: false,
      email_verified_at: null,
      last_login_at: null,
      created_at: new Date('2026-09-10T00:00:00.000Z'),
      departments: null,
      user_roles_user_roles_user_idTousers: [
        {
          roles: {
            code: 'SECURITY_OFFICER',
            name: 'Security Officer',
            role_permissions: [
              { permissions: { code: 'assets.update' } },
              { permissions: { code: 'assets.read' } },
            ],
          },
        },
        {
          roles: {
            code: 'CUSTOM_REVIEWER',
            name: 'Custom Reviewer',
            role_permissions: [{ permissions: { code: 'assets.read' } }],
          },
        },
      ],
    });

    const result = await usersService.findMe('user-1');

    expect(result.roles).toEqual([
      { code: 'SECURITY_OFFICER', name: 'Security Officer' },
      { code: 'CUSTOM_REVIEWER', name: 'Custom Reviewer' },
    ]);
    expect(result.permissions).toEqual(['assets.read', 'assets.update']);
  });

  it('returns 404 for a deleted or missing user', async () => {
    findFirstMock.mockResolvedValue(null);
    await expect(usersService.findMe('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});
