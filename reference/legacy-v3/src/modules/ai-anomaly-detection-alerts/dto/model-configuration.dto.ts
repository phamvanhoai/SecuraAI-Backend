import { z } from 'zod';

export const alertRiskLevels = ['low', 'medium', 'high', 'critical'] as const;

export const detectionRuleSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9][a-z0-9._-]*$/),
    name: z.string().trim().min(1).max(150),
    eventType: z.string().trim().min(1).max(100),
    threshold: z.number().int().min(1).max(10_000),
    windowSeconds: z.number().int().min(1).max(86_400),
    groupBy: z.enum(['sourceIp', 'logSource']),
    severity: z.enum(alertRiskLevels),
    enabled: z.boolean().default(true),
  })
  .strict();

export const modelParametersSchema = z
  .object({
    ollamaModel: z.string().trim().min(1).max(150),
    rules: z.array(detectionRuleSchema).max(100),
  })
  .strict();

export const createModelConfigurationBodySchema = z
  .object({
    modelName: z.string().trim().min(1).max(150),
    algorithm: z.string().trim().min(1).max(100),
    version: z.string().trim().min(1).max(50),
    provider: z.string().trim().min(1).max(150).default('ollama'),
    modelPath: z.string().trim().url().max(2000).optional(),
    ollamaModel: z.string().trim().min(1).max(150).default('qwen3:4b'),
    rules: z.array(detectionRuleSchema).max(100).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.modelPath !== undefined) {
      const modelUrl = new URL(value.modelPath);
      if (modelUrl.username || modelUrl.password) {
        context.addIssue({
          code: 'custom',
          path: ['modelPath'],
          message: 'Model path must not contain credentials',
        });
      }
    }
    const ids = new Set<string>();
    for (const rule of value.rules) {
      if (ids.has(rule.id)) {
        context.addIssue({ code: 'custom', path: ['rules'], message: 'Rule IDs must be unique' });
        return;
      }
      ids.add(rule.id);
    }
  });

export const modelVersionParamsSchema = z.object({ modelVersionId: z.uuid() }).strict();

export const listModelConfigurationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    modelName: z.string().trim().min(1).max(150).optional(),
    active: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

export type CreateModelConfigurationBody = z.infer<typeof createModelConfigurationBodySchema>;
export type ListModelConfigurationsQuery = z.infer<typeof listModelConfigurationsQuerySchema>;
