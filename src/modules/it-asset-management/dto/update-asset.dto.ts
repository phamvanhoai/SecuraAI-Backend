import { z } from 'zod';
import { assetTypeSchema } from './asset-type.dto.js';

export const updateAssetBodySchema = z.object({
  name: z.string().trim().min(3).max(100),
  assetType: assetTypeSchema,
  description: z.string().trim().max(2000).refine((value) => value.length === 0 || value.length >= 20, "Enter at least 20 characters or leave blank.").nullable(),
}).strict();
export type UpdateAssetInput = z.infer<typeof updateAssetBodySchema>;
