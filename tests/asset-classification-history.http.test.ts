import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/it-asset-management/assets.service.js', () => ({ assetsService: { classificationHistory: vi.fn() } }));
import { assetsRouter } from '../src/modules/it-asset-management/assets.routes.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/common/errors/app-error.js';
const actor = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const token = jwt.sign({ sub: actor, type: 'access' }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client', expiresIn: '5m' });
const app = express();
app.use('/assets', assetsRouter);
app.use(errorHandler);
beforeEach(() => vi.resetAllMocks());
describe('asset classification history HTTP boundary', () => {
  it('requires authentication', async () => {
    expect((await request(app).get(`/assets/${id}/classify-criticality/history`)).status).toBe(401);
    expect(assetsService.classificationHistory).not.toHaveBeenCalled();
  });
  it.each(['?page=0', '?limit=101', '?page=100001', '?actorId=forged'])('rejects invalid query %s', async (query) => {
    expect((await request(app).get(`/assets/${id}/classify-criticality/history${query}`).auth(token, { type: 'bearer' })).status).toBe(422);
    expect(assetsService.classificationHistory).not.toHaveBeenCalled();
  });
  it('uses authenticated actor and bounded defaults', async () => {
    vi.mocked(assetsService.classificationHistory).mockResolvedValue({ items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    const response = await request(app).get(`/assets/${id}/classify-criticality/history`).auth(token, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { items: [] } });
    expect(assetsService.classificationHistory).toHaveBeenCalledWith(actor, id, { page: 1, limit: 10 });
  });
  it('preserves access denial', async () => {
    vi.mocked(assetsService.classificationHistory).mockRejectedValue(new AppError(403, 'FORBIDDEN', 'Asset Owner access required'));
    expect((await request(app).get(`/assets/${id}/classify-criticality/history`).auth(token, { type: 'bearer' })).status).toBe(403);
  });
});
