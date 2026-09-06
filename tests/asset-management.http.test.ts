import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listAssetsMock } = vi.hoisted(() => ({ listAssetsMock: vi.fn() }));

vi.mock('../src/modules/asset-management/asset-management.repository.js', () => ({
  assetManagementRepository: { list: listAssetsMock },
}));

import { createApp } from '../src/app.js';

const accessToken = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: [], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000001',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );

describe('GET /api/v1/assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAssetsMock.mockResolvedValue({ items: [], total: 0 });
  });

  it('requires authentication', async () => {
    const response = await request(createApp()).get('/api/v1/assets');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(listAssetsMock).not.toHaveBeenCalled();
  });

  it('requires the assets.read permission', async () => {
    const response = await request(createApp())
      .get('/api/v1/assets')
      .set('authorization', `Bearer ${accessToken([])}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(listAssetsMock).not.toHaveBeenCalled();
  });

  it('returns a paginated list and normalized query values', async () => {
    const response = await request(createApp())
      .get('/api/v1/assets?page=2&limit=10&status=active&q=server')
      .set('authorization', `Bearer ${accessToken(['assets.read'])}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        items: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      },
    });
    expect(listAssetsMock).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      status: 'active',
      q: 'server',
      sortBy: 'assetCode',
      sortOrder: 'asc',
    });
  });

  it('rejects invalid filters before reaching the controller', async () => {
    const response = await request(createApp())
      .get('/api/v1/assets?limit=101')
      .set('authorization', `Bearer ${accessToken(['assets.read'])}`);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(listAssetsMock).not.toHaveBeenCalled();
  });
});
