import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/it-asset-management/business-services.repository.js', () => ({
  businessServicesRepository: {
    findActor: vi.fn(),
    list: vi.fn(),
    findById: vi.fn(),
    listAssets: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    deactivationCheck: vi.fn(),
    ownerOptions: vi.fn(),
  },
}));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { businessServicesRepository as repository } from '../src/modules/it-asset-management/business-services.repository.js';
const id = '00000000-0000-4000-8000-000000000001';
const token = jwt.sign({ type: 'access', role: 'SECURITY_OFFICER' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: id,
  expiresIn: '15m',
});
const app = createApp();
describe('business services HTTP reads', () => {
  it('exposes authenticated deactivation check and maps atomic transition', async () => {
    const at = new Date('2026-10-07T00:00:00.000Z');
    const service = {
      id,
      name: 'Support',
      description: null,
      status: 'ACTIVE',
      users: null,
      _count: { assets: 2 },
      created_at: at,
      updated_at: at,
    };
    vi.mocked(repository.deactivationCheck).mockResolvedValue({
      service,
      activeAssetsCount: 0,
      unresolvedRisksCount: 0,
    });
    const check = await request(app)
      .get(`/api/v1/business-services/${id}/deactivation-check`)
      .set('Authorization', `Bearer ${token}`);
    expect(check.status).toBe(200);
    expect(check.body.data.canDeactivate).toBe(true);
    vi.mocked(repository.deactivate).mockResolvedValue({ ...service, status: 'INACTIVE' });
    const result = await request(app)
      .post(`/api/v1/business-services/${id}/deactivate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedUpdatedAt: at.toISOString(),
        confirmationName: ' Support ',
        reason: ' Retired service ',
      });
    expect(result.status).toBe(200);
    expect(result.body.data.status).toBe('inactive');
    expect(repository.deactivate).toHaveBeenCalledWith(id, id, {
      expectedUpdatedAt: at.toISOString(),
      confirmationName: 'Support',
      reason: 'Retired service',
    });
  });
  it('enforces auth, role and strict validation on deactivation', async () => {
    expect(
      (await request(app).post(`/api/v1/business-services/${id}/deactivate`).send({})).status,
    ).toBe(401);
    expect(
      (await request(app).get(`/api/v1/business-services/${id}/deactivation-check`)).status,
    ).toBe(401);
    const body = {
      expectedUpdatedAt: '2026-10-07T00:00:00Z',
      confirmationName: 'Support',
      reason: 'Retired',
    };
    expect(
      (
        await request(app)
          .post(`/api/v1/business-services/${id}/deactivate`)
          .set('Authorization', `Bearer ${token}`)
          .send({ ...body, status: 'INACTIVE' })
      ).status,
    ).toBe(422);
    vi.mocked(repository.findActor).mockResolvedValue({ role: 'EXECUTIVE', status: 'ACTIVE' });
    expect(
      (
        await request(app)
          .post(`/api/v1/business-services/${id}/deactivate`)
          .set('Authorization', `Bearer ${token}`)
          .send(body)
      ).status,
    ).toBe(403);
    expect(repository.deactivate).not.toHaveBeenCalled();
  });
  it('validates and maps metadata PATCH through the service', async () => {
    const expectedUpdatedAt = '2026-10-07T00:00:00.000Z';
    const item = {
      id,
      name: 'New service name',
      status: 'ACTIVE',
      description: null,
      users: null,
      _count: { assets: 0 },
      created_at: new Date(expectedUpdatedAt),
      updated_at: new Date(expectedUpdatedAt),
    };
    vi.mocked(repository.update).mockResolvedValue(item);
    const response = await request(app)
      .patch(`/api/v1/business-services/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: ' New service name ', expectedUpdatedAt });
    expect(response.status).toBe(200);
    expect(repository.update).toHaveBeenCalledWith(id, id, {
      name: 'New service name',
      expectedUpdatedAt,
    });
    expect(
      (
        await request(app)
          .patch(`/api/v1/business-services/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ status: 'INACTIVE', expectedUpdatedAt })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .patch(`/api/v1/business-services/${id}`)
          .send({ name: 'New service name', expectedUpdatedAt })
      ).status,
    ).toBe(401);
  });
  it('requires auth and validates creation body', async () => {
    expect(
      (await request(app).post('/api/v1/business-services').send({ name: 'Support' })).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/business-services')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: ' ' })
      ).status,
    ).toBe(422);
  });
  it('creates through service and exposes owner-options before UUID route', async () => {
    const item = {
      id,
      name: 'Support',
      status: 'ACTIVE',
      description: null,
      users: null,
      _count: { assets: 0 },
      created_at: new Date(),
      updated_at: new Date(),
    };
    vi.mocked(repository.create).mockResolvedValue(item);
    const response = await request(app)
      .post('/api/v1/business-services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: ' Support ' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      name: 'Support',
      linkedAssetsCount: 0,
      status: 'active',
    });
    expect(repository.create).toHaveBeenCalledWith(id, { name: 'Support' });
    vi.mocked(repository.ownerOptions).mockResolvedValue([]);
    expect(
      (
        await request(app)
          .get('/api/v1/business-services/owner-options?q=test')
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(200);
  });
  it('does not allow nonofficer creation', async () => {
    vi.mocked(repository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    expect(
      (
        await request(app)
          .post('/api/v1/business-services')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Support' })
      ).status,
    ).toBe(403);
    expect(repository.create).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
  });
  it.each(['/business-services', `/business-services/${id}`, `/business-services/${id}/assets`])(
    'requires authentication for %s',
    async (path) => {
      expect((await request(app).get(`/api/v1${path}`)).status).toBe(401);
    },
  );
  it('returns filtered envelope through actual service', async () => {
    vi.mocked(repository.list).mockResolvedValue([0, []]);
    const response = await request(app)
      .get('/api/v1/business-services?q=customer&status=active')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } },
    });
    expect(repository.list).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      q: 'customer',
      status: 'active',
    });
  });
  it('rechecks database role rather than trusting the token role', async () => {
    vi.mocked(repository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    expect(
      (await request(app).get('/api/v1/business-services').set('Authorization', `Bearer ${token}`))
        .status,
    ).toBe(403);
    expect(repository.list).not.toHaveBeenCalled();
  });
  it.each([
    '/business-services?limit=101',
    '/business-services/not-uuid',
    `/business-services/${id}/assets?page=0`,
  ])('validates %s', async (path) => {
    expect(
      (await request(app).get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`)).status,
    ).toBe(422);
  });
  it('returns 404 for missing detail', async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);
    expect(
      (
        await request(app)
          .get(`/api/v1/business-services/${id}`)
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(404);
  });
  it('returns paginated linked assets', async () => {
    vi.mocked(repository.findById).mockResolvedValue({
      id,
      name: 'Support',
      description: null,
      status: 'ACTIVE',
      users: null,
      _count: { assets: 0 },
      created_at: new Date(),
      updated_at: new Date(),
    });
    vi.mocked(repository.listAssets).mockResolvedValue([0, []]);
    const response = await request(app)
      .get(`/api/v1/business-services/${id}/assets?page=2`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.pagination.page).toBe(2);
  });
});
