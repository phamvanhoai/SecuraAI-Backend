import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../src/modules/audit-settings/audit-settings.repository.js', () => ({
  auditSettingsRepository: { listLoginHistory: mocks.list },
}));
import { createApp } from '../src/app.js';
import { listLoginHistoryQuerySchema } from '../src/modules/audit-settings/dto/index.js';
const token = (roles: string[], permissions = ['login-history.read']) =>
  jwt.sign(
    { type: 'access', roles, permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '11111111-1111-4111-8111-111111111111',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );
describe('View Login History HTTP authorization and validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({
      items: [
        {
          login_history_id: '22222222-2222-4222-8222-222222222222',
          user_id: null,
          users: null,
          email_attempted: 'unknown@example.test',
          success: false,
          logged_in_at: new Date('2026-09-18T00:00:00Z'),
          ip_address: '127.0.0.1',
          user_agent: 'Test browser',
          failure_reason: 'INVALID_CREDENTIALS',
          password_hash: 'must-not-leak',
        },
      ],
      total: 1,
    });
  });
  it.each(['ADMIN', 'SECURITY_OFFICER'])(
    'allows %s and serializes only public fields',
    async (role) => {
      const response = await request(createApp())
        .get('/api/v1/login-history')
        .set('authorization', 'Bearer ' + token([role]))
        .query({ search: 'unknown', status: 'failed', limit: 10 });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items[0]).toEqual({
        id: '22222222-2222-4222-8222-222222222222',
        userId: null,
        userName: null,
        email: 'unknown@example.test',
        status: 'failed',
        loginTime: '2026-09-18T00:00:00.000Z',
        ipAddress: '127.0.0.1',
        userAgent: 'Test browser',
        failureReason: 'INVALID_CREDENTIALS',
      });
      expect(response.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(mocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'unknown', status: 'failed', limit: 10 }),
      );
    },
  );
  it.each(['EMPLOYEE', 'MANAGER', 'EXECUTIVE', 'SECURITY_OFFICER_CUSTOM'])(
    'denies %s even with the read permission',
    async (role) => {
      const response = await request(createApp())
        .get('/api/v1/login-history')
        .set('authorization', 'Bearer ' + token([role]));
      expect(response.status).toBe(403);
      expect(mocks.list).not.toHaveBeenCalled();
    },
  );
  it('denies an admin without the read permission', async () => {
    expect(
      (
        await request(createApp())
          .get('/api/v1/login-history')
          .set('authorization', 'Bearer ' + token(['ADMIN'], []))
      ).status,
    ).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each([undefined, 'invalid'])('requires a valid access token: %s', async (value) => {
    const call = request(createApp()).get('/api/v1/login-history');
    if (value) call.set('authorization', 'Bearer ' + value);
    expect((await call).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each([
    { limit: 101 },
    { page: 0 },
    { status: 'active' },
    { sortBy: 'password_hash' },
    { userId: 'invalid' },
    { ipAddress: 'hostname' },
    { from: '2026-09-19T00:00:00Z', to: '2026-09-18T00:00:00Z' },
    { unknown: 'value' },
    { search: ['one', 'two'] },
  ])('rejects invalid filters: %j', (query) => {
    expect(listLoginHistoryQuerySchema.safeParse(query).success).toBe(false);
  });
  it('rejects malformed filters at the API boundary', async () => {
    const response = await request(createApp())
      .get('/api/v1/login-history')
      .query({ limit: 101 })
      .set('authorization', 'Bearer ' + token(['ADMIN']));
    expect(response.status).toBe(422);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
