import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ value: 1 }]) } }));

describe('application', () => {
  it('returns liveness status', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp()).get('/api/v1/health/live');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.headers['x-request-id']).toBeTruthy();
  });
  it('returns a consistent 404 response', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp()).get('/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
