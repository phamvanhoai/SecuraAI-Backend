import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock(
  '../src/modules/information-security-incident-management/risk-reassessment-requests.service.js',
  () => ({
    riskReassessmentRequestsService: { history: vi.fn(), options: vi.fn(), create: vi.fn() },
  }),
);
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { riskReassessmentRequestsService } from '../src/modules/information-security-incident-management/risk-reassessment-requests.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const incidentId = '22222222-2222-4222-8222-222222222222';
const riskId = '33333333-3333-4333-8333-333333333333';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
});
const app = createApp();

describe('risk reassessment request routes', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires authentication', async () => {
    const response = await request(app)
      .post(`/api/v1/incidents/${incidentId}/risk-reassessment-requests`)
      .send({ riskId, reason: 'This incident requires reassessment of the linked risk.' });
    expect(response.status).toBe(401);
  });
  it('creates a pending request with 201', async () => {
    vi.mocked(riskReassessmentRequestsService.create).mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      reason: 'This incident requires reassessment of the linked risk.',
      status: 'pending',
      requestedAt: new Date(),
      incident: { id: incidentId, incidentCode: 'INC-1', title: 'Login' },
      risk: { id: riskId, riskCode: 'RISK-1', title: 'Compromise', status: 'open' },
      controlWeakness: null,
    });
    const response = await request(app)
      .post(`/api/v1/incidents/${incidentId}/risk-reassessment-requests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ riskId, reason: 'This incident requires reassessment of the linked risk.' });
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('pending');
  });
  it('returns paginated request history', async () => {
    vi.mocked(riskReassessmentRequestsService.history).mockResolvedValue({
      incident: { id: incidentId, incidentCode: 'INC-1', title: 'Login' },
      items: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
    const response = await request(app)
      .get(`/api/v1/incidents/${incidentId}/risk-reassessment-requests?page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.pagination.total).toBe(0);
  });
});
