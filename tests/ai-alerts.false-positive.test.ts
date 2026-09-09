import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  feedback: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: m.transaction } }));
import { createApp } from '../src/app.js';
import { aiAlertsRepository } from '../src/modules/ai-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-alerts/ai-alerts.service.js';
import { falsePositiveBodySchema } from '../src/modules/ai-alerts/dto/false-positive.dto.js';

const id = '00000000-0000-4000-8000-000000000010';
const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  permissions: ['ai-alerts.mark-false-positive'],
};
const context = { ipAddress: null, userAgent: null };
const initial = {
  ai_alert_id: id,
  alert_code: 'AI-1',
  status: 'new',
  reviewed_by_user_id: null,
  reviewed_at: null,
};
const token = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: [], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: actor.userId,
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );
const post = (permissions = actor.permissions, alertId = id) =>
  request(createApp())
    .post('/api/v1/ai-alerts/' + alertId + '/false-positive')
    .set('authorization', 'Bearer ' + token(permissions));

describe('Mark False Positive', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        ai_alerts: { findUnique: m.find, updateMany: m.update },
        ai_feedback: { create: m.feedback },
        audit_logs: { create: m.audit },
      }),
    );
    m.find.mockResolvedValue(initial);
    m.update.mockResolvedValue({ count: 1 });
  });
  it('validates comments and rejects attempts to override status or reviewer', () => {
    expect(falsePositiveBodySchema.parse({ comment: '  Expected scan  ' })).toEqual({
      comment: 'Expected scan',
    });
    for (const body of [
      { comment: '' },
      { comment: 'x'.repeat(2001) },
      { status: 'confirmed' },
      { reviewedByUserId: id },
    ]) {
      expect(falsePositiveBodySchema.safeParse(body).success).toBe(false);
    }
  });
  it('enforces authentication and both route and service permission checks', async () => {
    expect(
      (
        await request(createApp())
          .post('/api/v1/ai-alerts/' + id + '/false-positive')
          .send({})
      ).status,
    ).toBe(401);
    expect((await post([]).send({})).status).toBe(403);
    await expect(
      aiAlertsService.markFalsePositive(id, {}, { ...actor, permissions: [] }, context),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each(['new', 'reviewing'])('marks %s with atomic feedback and audit', async (status) => {
    m.find.mockResolvedValue({ ...initial, status });
    const response = await post().send({ comment: ' Expected scan ' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { id, status: 'false_positive', changed: true, reviewedByUserId: actor.userId },
    });
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ai_alert_id: id, status: { in: ['new', 'reviewing'] } },
      }),
    );
    expect(m.feedback).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ai_alert_id: id,
          reviewed_by_user_id: actor.userId,
          feedback_label: 'false_positive',
          comment: 'Expected scan',
        },
      }),
    );
    expect(m.audit).toHaveBeenCalledOnce();
  });
  it('returns unchanged without duplicate writes when already marked', async () => {
    m.find.mockResolvedValue({ ...initial, status: 'false_positive' });
    expect((await post().send({})).body.data.changed).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.feedback).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it.each(['confirmed', 'closed'])('rejects incompatible %s status', async (status) => {
    m.find.mockResolvedValue({ ...initial, status });
    expect((await post().send({})).status).toBe(409);
    expect(m.update).not.toHaveBeenCalled();
  });
  it('returns 404 for missing alerts and 422 for invalid input', async () => {
    m.find.mockResolvedValue(null);
    expect((await post().send({})).status).toBe(404);
    m.transaction.mockClear();
    expect((await post(actor.permissions, 'bad-id').send({})).status).toBe(422);
    expect((await post().send({ comment: '' })).status).toBe(422);
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('does not add feedback when a concurrent reviewer wins', async () => {
    m.update.mockResolvedValue({ count: 0 });
    m.find
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({ ...initial, status: 'confirmed' });
    expect((await post().send({})).status).toBe(409);
    expect(m.feedback).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it('treats a concurrent identical decision as unchanged', async () => {
    m.update.mockResolvedValue({ count: 0 });
    m.find
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({ ...initial, status: 'false_positive' });
    expect((await post().send({})).body.data.changed).toBe(false);
    expect(m.feedback).not.toHaveBeenCalled();
  });
  it('propagates audit failures out of the transaction so Prisma can roll back', async () => {
    m.audit.mockRejectedValue(new Error('audit unavailable'));
    await expect(
      aiAlertsRepository.markFalsePositive(id, {}, { ...context, actorUserId: actor.userId }),
    ).rejects.toThrow('audit unavailable');
  });
});
