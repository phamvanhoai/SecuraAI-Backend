import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { env } from '../../config/env.js';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('./issued-certificates.service.js', () => ({ issuedCertificatesService: mocks }));

const app = createApp();
const token = (permissions: string[]) =>
  jwt.sign({ type: 'access', roles: ['SECURITY_OFFICER'], permissions }, env.JWT_ACCESS_SECRET, {
    subject: '00000000-0000-4000-8000-000000000001',
    issuer: 'securaai-api',
    audience: 'securaai-client',
    expiresIn: '1m',
  });

describe('issued certificate route security', () => {
  afterEach(() => vi.clearAllMocks());

  it('requires authentication and the issued-certificate permission', async () => {
    expect((await request(app).get('/api/v1/training/certificates')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/training/certificates').auth(token([]), { type: 'bearer' }))
        .status,
    ).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('validates bounded pagination before service access', async () => {
    const result = await request(app)
      .get('/api/v1/training/certificates?limit=51')
      .auth(token(['training-certificates.read-issued']), { type: 'bearer' });
    expect(result.status).toBe(422);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('returns the standard envelope for an authorized reader', async () => {
    mocks.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    const result = await request(app)
      .get('/api/v1/training/certificates')
      .auth(token(['training-certificates.read-issued']), { type: 'bearer' });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      success: true,
      data: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } },
    });
  });
});
