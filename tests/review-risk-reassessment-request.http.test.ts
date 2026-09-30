import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/risk-assessment/risk-reassessment-review.service.js', () => ({ riskReassessmentReviewService: { listOwned: vi.fn(), startReview: vi.fn(), complete: vi.fn() } }));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { riskReassessmentReviewService } from '../src/modules/risk-assessment/risk-reassessment-review.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client', subject: userId });
const app = createApp();

describe('risk reassessment review routes', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires authentication', async () => {
    expect((await request(app).post(`/api/v1/risks/reassessment-requests/${requestId}/review`)).status).toBe(401);
  });
  it('starts review with 200', async () => {
    vi.mocked(riskReassessmentReviewService.startReview).mockResolvedValue({
      id: requestId, reason: 'Review reason', status: 'under_review', requestedAt: new Date(), reviewedAt: null,
      risk: { id: requestId, riskCode: 'RISK-1', title: 'Compromise', status: 'open', latestInherentAssessment: null, treatmentPlans: [] },
      incident: { id: requestId, incidentCode: 'INC-1', title: 'Login', severity: 'high' },
      controlWeakness: null, requestedBy: { id: requestId, fullName: 'Security Officer' },
    });
    const response = await request(app).post(`/api/v1/risks/reassessment-requests/${requestId}/review`).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('under_review');
  });
});
