import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/information-security-incident-management/incidents.service.js', () => ({
  incidentsService: { list: vi.fn(), detail: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { incidentsService } from '../src/modules/information-security-incident-management/incidents.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const incidentId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});
const app = createApp();

describe('view incidents HTTP routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes list filters to the service', async () => {
    vi.mocked(incidentsService.list).mockResolvedValue({
      items: [],
      pagination: { page: 2, limit: 20, total: 0, totalPages: 0 },
    });
    const response = await request(app)
      .get('/api/v1/incidents?page=2&limit=20&search=login&severity=high&status=triage')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(incidentsService.list).toHaveBeenCalledWith(userId, {
      page: 2,
      limit: 20,
      search: 'login',
      severity: 'high',
      status: 'triage',
    });
  });

  it('returns selected incident details', async () => {
    vi.mocked(incidentsService.detail).mockResolvedValue({} as never);
    const response = await request(app)
      .get(`/api/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(incidentsService.detail).toHaveBeenCalledWith(userId, incidentId);
  });

  it('leaves pending mine route available to the legacy handler', async () => {
    const response = await request(app)
      .get('/api/v1/incidents/mine')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(501);
    expect(response.body.error.code).toBe('ENDPOINT_NOT_IMPLEMENTED');
  });
});
