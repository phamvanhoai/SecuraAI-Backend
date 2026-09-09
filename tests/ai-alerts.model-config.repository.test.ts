import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  auditMock,
  countMock,
  createMock,
  findManyMock,
  findUniqueMock,
  transactionMock,
  updateManyMock,
  updateMock,
} = vi.hoisted(() => ({
  auditMock: vi.fn(),
  countMock: vi.fn(),
  createMock: vi.fn(),
  findManyMock: vi.fn(),
  findUniqueMock: vi.fn(),
  transactionMock: vi.fn(),
  updateManyMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    ai_alerts: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    ai_model_versions: { count: countMock, findMany: findManyMock },
    $transaction: transactionMock,
  },
}));

import { aiAlertsRepository } from '../src/modules/ai-alerts/ai-alerts.repository.js';

const model = {
  ai_model_version_id: 'model-1',
  model_name: 'security-anomaly',
  algorithm: 'hybrid-rules-llm',
  version: '1.0.0',
  provider: 'ollama',
  model_path: null,
  parameters: { ollamaModel: 'qwen3:4b', rules: [] },
  is_active: false,
  created_at: new Date('2026-09-08T00:00:00.000Z'),
};

describe('aiAlertsRepository model configuration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists configurations with bounded pagination and filters', async () => {
    transactionMock.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    countMock.mockResolvedValue(1);
    findManyMock.mockResolvedValue([model]);
    await expect(
      aiAlertsRepository.listModelConfigurations({
        page: 2,
        limit: 10,
        modelName: 'security-anomaly',
        active: true,
      }),
    ).resolves.toEqual({ items: [model], total: 1 });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { model_name: 'security-anomaly', is_active: true },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('creates the immutable version and audit record in one transaction', async () => {
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({ ai_model_versions: { create: createMock }, audit_logs: { create: auditMock } }),
    );
    createMock.mockResolvedValue(model);
    await aiAlertsRepository.createModelConfiguration(
      {
        modelName: 'security-anomaly',
        algorithm: 'hybrid-rules-llm',
        version: '1.0.0',
        provider: 'ollama',
        ollamaModel: 'qwen3:4b',
        rules: [],
      },
      { actorUserId: 'user-1', ipAddress: null, userAgent: null },
    );
    const createArgument: unknown = createMock.mock.calls[0]?.[0];
    const auditArgument: unknown = auditMock.mock.calls[0]?.[0];
    expect(createArgument).toMatchObject({ data: { is_active: false } });
    expect(auditArgument).toMatchObject({
      data: { action: 'ai_model_configuration.created' },
    });
  });

  it('atomically switches the active version for one model name', async () => {
    transactionMock.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        ai_model_versions: {
          findUnique: findUniqueMock,
          updateMany: updateManyMock,
          update: updateMock,
        },
        audit_logs: { create: auditMock },
      }),
    );
    findUniqueMock.mockResolvedValue(model);
    updateMock.mockResolvedValue({ ...model, is_active: true });
    await aiAlertsRepository.activateModelConfiguration('model-1', {
      actorUserId: 'user-1',
      ipAddress: null,
      userAgent: null,
    });
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { model_name: 'security-anomaly', is_active: true },
      data: { is_active: false },
    });
    expect(updateMock).toHaveBeenCalledOnce();
    expect(auditMock).toHaveBeenCalledOnce();
  });
});
