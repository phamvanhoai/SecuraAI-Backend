import { z } from 'zod';

const impactScoreSchema = z.number().int().min(1).max(5);

export const classifyAssetBodySchema = z
  .object({
    confidentialityImpact: impactScoreSchema,
    integrityImpact: impactScoreSchema,
    availabilityImpact: impactScoreSchema,
    businessImpact: impactScoreSchema,
    rationale: z.string().trim().min(20).max(2000),
    dataClassificationBasis: z.string().trim().min(20).max(2000),
    dataClassification: z.enum(['public', 'internal', 'confidential', 'restricted']),
  })
  .strict();

export type ClassifyAssetInput = z.infer<typeof classifyAssetBodySchema>;

export const assetClassificationHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
}).strict();
export const assetClassificationSnapshotSchema = z.object({
  confidentialityImpact: impactScoreSchema.nullable(),
  integrityImpact: impactScoreSchema.nullable(),
  availabilityImpact: impactScoreSchema.nullable(),
  businessImpact: impactScoreSchema.nullable(),
  criticality: z.string().nullable(), dataClassification: z.string().nullable(),
  rationale: z.string().nullable(), dataClassificationBasis: z.string().nullable(),
  methodVersion: z.string().nullable(), dataClassificationMethodVersion: z.string().nullable(),
  assessedBy: z.uuid().nullable(), assessedAt: z.iso.datetime({ offset: true }).nullable(),
});
