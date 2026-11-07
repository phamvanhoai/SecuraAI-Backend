import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const image = vi.hoisted(() => vi.fn());
vi.mock('../src/modules/notification-system-logs/notifications.service.js', () => ({ notificationsService: { image } }));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/common/errors/app-error.js';
const app = createApp();
const id = '11111111-1111-4111-8111-111111111111';
const token = jwt.sign({ type: 'access', passwordVersion: 0 }, env.JWT_ACCESS_SECRET, { subject: id, issuer: 'securaai-api', audience: 'securaai-client', expiresIn: '15m' });
beforeEach(() => { vi.clearAllMocks(); image.mockResolvedValue({ name: 'test.png', buffer: Buffer.from('verified-png') }); });
it('requires authentication before exposing a notification image', async () => {
  expect((await request(app).get(`/api/v1/notifications/${id}/images/0`)).status).toBe(401);
  expect(image).not.toHaveBeenCalled();
});
it('serves authenticated image bytes with private no-store headers', async () => {
  const response = await request(app).get(`/api/v1/notifications/${id}/images/0`).auth(token, { type: 'bearer' });
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('image/png');
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(image).toHaveBeenCalledWith(id, id, 0);
});
it('rejects invalid image indices and notification identifiers', async () => {
  expect((await request(app).get(`/api/v1/notifications/${id}/images/99`).auth(token, { type: 'bearer' })).status).toBe(422);
  expect((await request(app).get('/api/v1/notifications/not-a-uuid/images/0').auth(token, { type: 'bearer' })).status).toBe(422);
  expect(image).not.toHaveBeenCalled();
});
it('does not disclose an unavailable or unauthorized image', async () => {
  image.mockRejectedValue(new AppError(404, 'NOTIFICATION_IMAGE_NOT_FOUND', 'The image is unavailable'));
  expect((await request(app).get(`/api/v1/notifications/${id}/images/0`).auth(token, { type: 'bearer' })).status).toBe(404);
});
