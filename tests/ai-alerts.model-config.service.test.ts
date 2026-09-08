import { beforeEach, describe, expect, it, vi } from 'vitest';

const { activateMock, createMock, listMock } = vi.hoisted(() => ({
  activateMock: vi.fn(),
  createMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock('../src/modules/ai-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: {
    activateModelConfiguration: activateMock,
    createModelConfiguration: createMock,
    listModelConfigurations: listMock,
  },
}));

import { aiAlertsService } from '../src/modules/ai-alerts/ai-alerts.service.js';

const record = {
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

describe('aiAlertsService model configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({ items: [record], total: 1 });
    createMock.mockResolvedValue(record);
    activateMock.mockResolvedValue({ ...record, is_active: true });
  });

  it('requires model permissions', async () => {
    await expect(
      aiAlertsService.listModelConfigurations(
        { page: 1, limit: 20 },
        { userId: 'user-1', permissions: [] },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('creates immutable inactive configurations', async () => {
    const result = await aiAlertsService.createModelConfiguration(
      {
        modelName: 'security-anomaly',
        algorithm: 'hybrid-rules-llm',
        version: '1.0.0',
        provider: 'ollama',
        ollamaModel: 'qwen3:4b',
        rules: [],
      },
      { userId: 'user-1', permissions: ['ai-models.manage'] },
      { ipAddress: null, userAgent: null },
    );
    expect(result).toMatchObject({ modelName: 'security-anomaly', active: false });
  });

  it('returns not found for an unknown activation target', async () => {
    activateMock.mockResolvedValue(null);
    await expect(
      aiAlertsService.activateModelConfiguration(
        record.ai_model_version_id,
        { userId: 'user-1', permissions: ['ai-models.manage'] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'MODEL_VERSION_NOT_FOUND' });
  });

  it('maps model path without exposing database field names', async () => {
    createMock.mockResolvedValue({ ...record, model_path: 'http://127.0.0.1:11434' });
    await expect(
      aiAlertsService.createModelConfiguration(
        {
          modelName: 'security-anomaly',
          algorithm: 'hybrid-rules-llm',
          version: '1.0.0',
          provider: 'ollama',
          modelPath: 'http://127.0.0.1:11434',
          ollamaModel: 'qwen3:4b',
          rules: [],
        },
        { userId: 'user-1', permissions: ['ai-models.manage'] },
        { ipAddress: null, userAgent: null },
      ),
    ).resolves.toMatchObject({ modelPath: 'http://127.0.0.1:11434' });
  });
});
