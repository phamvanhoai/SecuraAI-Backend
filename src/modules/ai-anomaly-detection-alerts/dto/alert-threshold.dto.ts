import { z } from 'zod';

export const alertThresholdRiskLevels = ['low', 'medium', 'high', 'critical'] as const;

export const listAlertThresholdsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
});

export const alertThresholdAssetParamsSchema = z.object({ assetId: z.uuid() });

export const setAlertThresholdBodySchema = z.object({
  threshold: z.number().min(0.01).max(1),
  riskLevelMin: z.enum(alertThresholdRiskLevels).nullable().default(null),
  enabled: z.boolean().default(true),
});

export type ListAlertThresholdsQuery = z.infer<typeof listAlertThresholdsQuerySchema>;
export type SetAlertThresholdBody = z.infer<typeof setAlertThresholdBodySchema>;
