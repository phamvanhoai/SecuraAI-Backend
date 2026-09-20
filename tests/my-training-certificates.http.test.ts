import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../src/modules/training-awareness/my-certificates.repository.js', () => ({
  myCertificatesRepository: mocks,
}));
import { createApp } from '../src/app.js';

const userId = '00000000-0000-4000-8000-000000000001';
const token = (permissions: string[]) =>
  jwt.sign(
    { type: 'access', roles: [], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: userId,
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );
const path = '/api/v1/training/my-certificates';

describe('my training certificates HTTP', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication and the own-certificate permission', async () => {
    expect((await request(createApp()).get(path)).status).toBe(401);
    expect(
      (
        await request(createApp())
          .get(path)
          .set('authorization', `Bearer ${token(['training-completion.read'])}`)
      ).status,
    ).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('rejects unbounded pagination', async () => {
    expect(
      (
        await request(createApp())
          .get(`${path}?limit=1000`)
          .set('authorization', `Bearer ${token(['training-certificates.read-own'])}`)
      ).status,
    ).toBe(422);
  });

  it('returns only the authenticated user query', async () => {
    mocks.list.mockResolvedValue({ total: 0, items: [] });
    const response = await request(createApp())
      .get(`${path}?q=phishing&userId=someone-else`)
      .set('authorization', `Bearer ${token(['training-certificates.read-own'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { items: [], pagination: { total: 0 } },
    });
    expect(mocks.list).toHaveBeenCalledWith(userId, { page: 1, limit: 10, q: 'phishing' });
  });
});
