import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/access-control/access-control.service.js', () => ({
  accessControlService: {
    hasPermission: vi.fn(),
    listPermissions: vi.fn(),
    listRoles: vi.fn(),
    getRole: vi.fn(),
    configureRolePermissions: vi.fn(),
    getUserPermissions: vi.fn(),
    configureUserPermissions: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { accessControlService } from '../src/modules/access-control/access-control.service.js';

const actorId = 'bd804acd-a5f7-4f4d-80e8-c0d53c219e31';
const roleId = '00000000-0000-4000-8000-000000000004';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: actorId,
});

describe('detailed permission HTTP routes', () => {
  const app = createApp();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accessControlService.hasPermission).mockResolvedValue(true);
  });

  it('lists the permission catalog for an authorized administrator', async () => {
    vi.mocked(accessControlService.listPermissions).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    const response = await request(app)
      .get('/api/v1/access-control/permissions')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(accessControlService.listPermissions).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({ page: 1, limit: 100 }),
    );
  });

  it('rejects an invalid role permission body before the controller', async () => {
    const response = await request(app)
      .put(`/api/v1/access-control/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissionIds: ['not-a-uuid'], expectedUpdatedAt: 'bad', reason: 'short' });
    expect(response.status).toBe(422);
    expect(accessControlService.configureRolePermissions).not.toHaveBeenCalled();
  });

  it('requires a valid access token', async () => {
    const response = await request(app).get('/api/v1/access-control/roles');
    expect(response.status).toBe(401);
  });
});
