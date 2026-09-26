import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js', () => ({
  aiAlertsService: { listModelVersions: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client', subject: userId,
  expiresIn: '15m',
});

describe('GET /api/v1/ai-alerts/models', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/ai-alerts/models')).status).toBe(401);
  });

  it('returns paginated model versions', async () => {
    vi.mocked(aiAlertsService.listModelVersions).mockResolvedValue({
      items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    const response = await request(app).get('/api/v1/ai-alerts/models?page=1&limit=20').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toMatchObject({ total: 0 });
  });

  it('rejects unsupported statuses', async () => {
    const response = await request(app).get('/api/v1/ai-alerts/models?status=active').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(aiAlertsService.listModelVersions).not.toHaveBeenCalled();
  });
});
