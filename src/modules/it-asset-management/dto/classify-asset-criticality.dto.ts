import { z } from 'zod';

const impactScoreSchema = z.number().int().min(1).max(5);

export const classifyAssetCriticalityBodySchema = z
  .object({
    confidentialityImpact: impactScoreSchema,
    integrityImpact: impactScoreSchema,
    availabilityImpact: impactScoreSchema,
    businessImpact: impactScoreSchema,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export type ClassifyAssetCriticalityBody = z.infer<
  typeof classifyAssetCriticalityBodySchema
>;
