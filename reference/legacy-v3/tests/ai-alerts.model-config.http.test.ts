import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { activateModelMock, createModelMock, listModelsMock } = vi.hoisted(() => ({
  activateModelMock: vi.fn(),
  createModelMock: vi.fn(),
  listModelsMock: vi.fn(),
}));

vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: {
    activateModelConfiguration: activateModelMock,
    createModelConfiguration: createModelMock,
    listModelConfigurations: listModelsMock,
  },
}));

import { createApp } from '../src/app.js';

const token = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: [], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000001',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );

const modelRecord = {
  ai_model_version_id: '00000000-0000-4000-8000-000000000010',
  model_name: 'security-anomaly',
  algorithm: 'hybrid-rules-llm',
  version: '1.0.0',
  provider: 'ollama',
  model_path: null,
  parameters: { ollamaModel: 'qwen3:4b', rules: [] },
  is_active: false,
  created_at: new Date('2026-09-08T00:00:00.000Z'),
};

describe('AI model configuration HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listModelsMock.mockResolvedValue({ items: [], total: 0 });
    createModelMock.mockResolvedValue(modelRecord);
    activateModelMock.mockResolvedValue({ ...modelRecord, is_active: true });
  });

  it('keeps the models route ahead of dynamic routes and enforces read permission', async () => {
    const forbidden = await request(createApp())
      .get('/api/v1/ai-alerts/models')
      .set('authorization', `Bearer ${token([])}`);
    expect(forbidden.status).toBe(403);

    const response = await request(createApp())
      .get('/api/v1/ai-alerts/models?active=true&limit=10')
      .set('authorization', `Bearer ${token(['ai-models.read'])}`);
    expect(response.status).toBe(200);
    const queryArgument: unknown = listModelsMock.mock.calls[0]?.[0];
    expect(queryArgument).toMatchObject({ active: true, limit: 10 });
  });

  it('protects and validates model configuration creation', async () => {
    const path = '/api/v1/ai-alerts/models';
    expect((await request(createApp()).post(path).send({})).status).toBe(401);
    expect(
      (
        await request(createApp())
          .post(path)
          .set('authorization', `Bearer ${token([])}`)
          .send({})
      ).status,
    ).toBe(403);
    const invalid = await request(createApp())
      .post(path)
      .set('authorization', `Bearer ${token(['ai-models.manage'])}`)
      .send({ modelName: 'security-anomaly' });
    expect(invalid.status).toBe(422);
    expect(createModelMock).not.toHaveBeenCalled();

    const response = await request(createApp())
      .post(path)
      .set('authorization', `Bearer ${token(['ai-models.manage'])}`)
      .send({
        modelName: 'security-anomaly',
        algorithm: 'hybrid-rules-llm',
        version: '1.0.0',
        rules: [
          {
            id: 'failed-login',
            name: 'More than three failed logins',
            eventType: 'authentication.failed',
            threshold: 4,
            windowSeconds: 300,
            groupBy: 'sourceIp',
            severity: 'high',
          },
        ],
      });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: { modelName: 'security-anomaly', active: false },
    });
  });

  it('activates a configured model version with explicit permission', async () => {
    const response = await request(createApp())
      .post(`/api/v1/ai-alerts/models/${modelRecord.ai_model_version_id}/activate`)
      .set('authorization', `Bearer ${token(['ai-models.manage'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { active: true } });
    expect(activateModelMock).toHaveBeenCalledOnce();
  });
});
