import { describe, expect, it } from 'vitest';
import {
  createModelConfigurationBodySchema,
  listModelConfigurationsQuerySchema,
} from '../src/modules/ai-alerts/dto/model-configuration.dto.js';

describe('model configuration DTO', () => {
  it('defaults to a local pre-trained Ollama model', () => {
    expect(
      createModelConfigurationBodySchema.parse({
        modelName: 'security-anomaly',
        algorithm: 'hybrid-rules-llm',
        version: '1.0.0',
      }),
    ).toMatchObject({ provider: 'ollama', ollamaModel: 'qwen3:4b', rules: [] });
  });

  it('accepts bounded detection rules and rejects duplicate IDs', () => {
    const rule = {
      id: 'failed-login',
      name: 'Failed login threshold',
      eventType: 'authentication.failed',
      threshold: 4,
      windowSeconds: 300,
      groupBy: 'sourceIp',
      severity: 'high',
    } as const;
    expect(
      createModelConfigurationBodySchema.safeParse({
        modelName: 'security-anomaly',
        algorithm: 'hybrid-rules-llm',
        version: '1.0.0',
        rules: [rule],
      }).success,
    ).toBe(true);
    expect(
      createModelConfigurationBodySchema.safeParse({
        modelName: 'security-anomaly',
        algorithm: 'hybrid-rules-llm',
        version: '1.0.0',
        rules: [rule, rule],
      }).success,
    ).toBe(false);
  });

  it('rejects credentials in model URLs and unsafe rule identifiers', () => {
    expect(
      createModelConfigurationBodySchema.safeParse({
        modelName: 'security-anomaly',
        algorithm: 'hybrid-rules-llm',
        version: '1.0.0',
        modelPath: 'https://user:secret@example.com/model',
      }).success,
    ).toBe(false);
    expect(
      createModelConfigurationBodySchema.safeParse({
        modelName: 'security-anomaly',
        algorithm: 'hybrid-rules-llm',
        version: '1.0.0',
        rules: [
          {
            id: '../unsafe',
            name: 'Unsafe rule',
            eventType: 'authentication.failed',
            threshold: 4,
            windowSeconds: 300,
            groupBy: 'sourceIp',
            severity: 'high',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('normalizes bounded list filters', () => {
    expect(listModelConfigurationsQuerySchema.parse({ active: 'true' })).toEqual({
      page: 1,
      limit: 20,
      active: true,
    });
    expect(listModelConfigurationsQuerySchema.safeParse({ active: 'yes' }).success).toBe(false);
    expect(listModelConfigurationsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});
