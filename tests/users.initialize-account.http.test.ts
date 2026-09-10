import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  createInitializedUser: vi.fn(),
  sendInitializedAccountEmail: vi.fn(),
}));

vi.mock('../src/modules/users/users.repository.js', () => ({ usersRepository: mocks }));
vi.mock('../src/modules/auth/auth.email.service.js', () => ({ authEmailService: mocks }));

import { createApp } from '../src/app.js';

const token = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: ['ADMIN'], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000001',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );

describe('user account initialization HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createInitializedUser.mockResolvedValue({
      kind: 'created',
      user: {
        user_id: '00000000-0000-4000-8000-000000000010',
        email: 'yennhidoan08042004@gmail.com',
        full_name: 'Yen Nhi Doan',
      },
    });
    mocks.list.mockResolvedValue({ items: [], total: 0, summary: { active: 0, inactive: 0, locked: 0, disabled: 0 } });
    mocks.sendInitializedAccountEmail.mockResolvedValue(undefined);
  });

  it('requires the users.create permission', async () => {
    const path = '/api/v1/users';
    expect((await request(createApp()).post(path).send({})).status).toBe(401);
    expect(
      (await request(createApp()).post(path).set('authorization', `Bearer ${token([])}`).send({})).status,
    ).toBe(403);
  });

  it('lists users through the admin endpoint', async () => {
    mocks.list.mockResolvedValue({
      items: [
        {
          user_id: '00000000-0000-4000-8000-000000000010',
          email: 'yennhidoan08042004@gmail.com',
          full_name: 'Yen Nhi Doan',
          employee_code: 'SEC-0241',
          status: 'active',
          created_at: new Date('2026-09-10T21:42:26.972Z'),
          departments: { department_id: 'department-id', code: 'IT', name: 'Information Technology' },
          user_roles_user_roles_user_idTousers: [{ roles: { code: 'EMPLOYEE', name: 'Employee' } }],
        },
      ],
      total: 1,
      summary: { active: 1, inactive: 0, locked: 0, disabled: 0 },
    });

    const response = await request(createApp())
      .get('/api/v1/admin/users?q=Yen&status=active')
      .set('authorization', `Bearer ${token(['users.read'])}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items[0]).toMatchObject({
      email: 'yennhidoan08042004@gmail.com',
      employeeCode: 'SEC-0241',
      status: 'active',
    });
    expect(mocks.list).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: 'Yen',
      status: 'active',
    });
  });

  it('creates the account and sends its initialization email', async () => {
    const response = await request(createApp())
      .post('/api/v1/users')
      .set('authorization', `Bearer ${token(['users.create'])}`)
      .send({
        email: 'YenNhiDoan08042004@GMAIL.COM',
        fullName: 'Yen Nhi Doan',
        roleCodes: ['EMPLOYEE'],
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      email: 'yennhidoan08042004@gmail.com',
      fullName: 'Yen Nhi Doan',
    });
    expect(mocks.createInitializedUser).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: '00000000-0000-4000-8000-000000000001',
        body: expect.objectContaining({ roleCodes: ['EMPLOYEE'] }),
        passwordHash: expect.any(String),
      }),
    );
    expect(mocks.sendInitializedAccountEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'yennhidoan08042004@gmail.com',
        email: 'yennhidoan08042004@gmail.com',
        temporaryPassword: expect.stringMatching(/^\d{8}$/),
      }),
    );
  });

  it('supports the admin users endpoint alias', async () => {
    const response = await request(createApp())
      .post('/api/v1/admin/users')
      .set('authorization', `Bearer ${token(['users.create'])}`)
      .send({
        email: 'new-user@example.com',
        fullName: 'New User',
        roleCodes: ['EMPLOYEE'],
      });

    expect(response.status).toBe(201);
    expect(mocks.createInitializedUser).toHaveBeenCalled();
  });

  it('rejects invalid initialization input before the repository', async () => {
    const response = await request(createApp())
      .post('/api/v1/users')
      .set('authorization', `Bearer ${token(['users.create'])}`)
      .send({ email: 'invalid', fullName: 'A', roleCodes: [] });

    expect(response.status).toBe(422);
    expect(mocks.createInitializedUser).not.toHaveBeenCalled();
  });
});