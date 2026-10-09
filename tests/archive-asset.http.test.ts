import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/it-asset-management/assets.service.js', () => ({ assetsService: { archive: vi.fn() } }));
import { assetsRouter } from '../src/modules/it-asset-management/assets.routes.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
import { errorHandler } from '../src/common/middleware/error-handler.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/common/errors/app-error.js';
const userId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
const token = jwt.sign({ sub: userId, type: 'access' }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client', expiresIn: '5m' });
const app = express();
app.use(express.json());
app.use('/assets', assetsRouter);
app.use(errorHandler);
describe('archive HTTP contract', () => {
  beforeEach(() => vi.resetAllMocks());
  it('requires authentication', async () => {
    expect((await request(app).delete(`/assets/${assetId}`).send({ reason: 'Retired' })).status).toBe(401);
    expect(assetsService.archive).not.toHaveBeenCalled();
  });
  it.each([{}, { reason: ' ' }, { reason: 'Retired', archivedBy: userId }])('rejects invalid body %j', async (input) => {
    expect((await request(app).delete(`/assets/${assetId}`).auth(token, { type: 'bearer' }).send(input)).status).toBe(422);
    expect(assetsService.archive).not.toHaveBeenCalled();
  });
  it('uses authenticated actor and trimmed reason and returns 204', async () => {
    const response = await request(app).delete(`/assets/${assetId}`).auth(token, { type: 'bearer' }).send({ reason: ' Retired ' });
    expect(response.status).toBe(204);
    expect(assetsService.archive).toHaveBeenCalledWith(userId, assetId, { reason: 'Retired' }, null);
  });
  it('preserves actionable dependency error', async () => {
    vi.mocked(assetsService.archive).mockRejectedValue(new AppError(409, 'ASSET_HAS_ACTIVE_DEPENDENCIES', 'AST-A depends on this asset'));
    const response = await request(app).delete(`/assets/${assetId}`).auth(token, { type: 'bearer' }).send({ reason: 'Retired' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ASSET_HAS_ACTIVE_DEPENDENCIES');
  });
});
