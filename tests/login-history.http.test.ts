import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/audit-security-reporting/login-history.service.js', () => ({
  loginHistoryService: { list: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { loginHistoryService } from '../src/modules/audit-security-reporting/login-history.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});
const app = createApp();

describe('login history HTTP endpoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/login-history')).status).toBe(401);
  });

  it('returns the paginated response', async () => {
    vi.mocked(loginHistoryService.list).mockResolvedValue({
      items: [],
      summary: { successful: 0, failed: 0, accounts: 0 },
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    const response = await request(app)
      .get('/api/v1/login-history?status=success')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(loginHistoryService.list).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ status: 'success', page: 1, limit: 20 }),
    );
  });

  it('rejects invalid bounded query parameters', async () => {
    const response = await request(app)
      .get('/api/v1/login-history?limit=101')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(loginHistoryService.list).not.toHaveBeenCalled();
  });
});
