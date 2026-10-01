import { z } from 'zod';

const impactScoreSchema = z.number().int().min(1).max(5);

export const classifyAssetBodySchema = z
  .object({
    confidentialityImpact: impactScoreSchema,
    integrityImpact: impactScoreSchema,
    availabilityImpact: impactScoreSchema,
    businessImpact: impactScoreSchema,
    dataClassification: z.enum(['public', 'internal', 'confidential', 'restricted']),
  })
  .strict();

export type ClassifyAssetInput = z.infer<typeof classifyAssetBodySchema>;
