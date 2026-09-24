import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
}));

import { createApp } from '../src/app.js';

describe('V2 baseline routes', () => {
  const app = createApp();

  it('exposes liveness and readiness checks', async () => {
    const live = await request(app).get('/api/v1/health/live');
    expect(live.status).toBe(200);
    expect(live.body).toMatchObject({ success: true, data: { status: 'ok' } });

    const ready = await request(app).get('/api/v1/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ success: true, data: { database: 'up' } });
  });

  it('does not expose removed training or invalid methods', async () => {
    for (const path of ['/api/v1/training', '/api/v1/auth/login']) {
      const response = await request(app).get(path);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
    }
  });
});
