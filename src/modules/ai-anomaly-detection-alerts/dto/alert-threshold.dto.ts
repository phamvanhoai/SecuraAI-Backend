import { z } from 'zod';

// Values accepted by the asset-threshold risk-level filter.
export const alertThresholdRiskLevels = ['low', 'medium', 'high', 'critical'] as const;

// Validate pagination and optional search for saved asset thresholds.
export const listAlertThresholdsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
});

// Validate the optional search used by the asset picker.
export const listAlertThresholdAssetOptionsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
});

// Validate :assetId before loading or updating an asset threshold.
export const alertThresholdAssetParamsSchema = z.object({ assetId: z.uuid() });

// Validate the body for creating or editing one asset-specific threshold.
export const setAlertThresholdBodySchema = z.object({
  mode: z.enum(['create', 'edit']).default('create'),
  threshold: z.number().min(0.01).max(1),
  riskLevelMin: z.enum(alertThresholdRiskLevels).nullable().default(null),
  enabled: z.boolean().default(true),
});

export type ListAlertThresholdsQuery = z.infer<typeof listAlertThresholdsQuerySchema>;
export type ListAlertThresholdAssetOptionsQuery = z.infer<
  typeof listAlertThresholdAssetOptionsQuerySchema
>;
// mode stays optional in the service type for callers that use the schema default.
export type SetAlertThresholdBody = Omit<z.infer<typeof setAlertThresholdBodySchema>, 'mode'> & {
  mode?: 'create' | 'edit';
};
