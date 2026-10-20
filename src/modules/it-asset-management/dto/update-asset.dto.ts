import { z } from 'zod';
import { assetTypeSchema } from './asset-type.dto.js';

export const updateAssetBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  assetType: assetTypeSchema,
  description: z.string().trim().max(10_000).nullable(),
}).strict();
export type UpdateAssetInput = z.infer<typeof updateAssetBodySchema>;
