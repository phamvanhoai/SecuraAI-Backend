import { z } from 'zod';

export const updateAssetBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  assetType: z.string().trim().min(1).max(100),
  description: z.string().trim().max(10_000).nullable(),
}).strict();
export type UpdateAssetInput = z.infer<typeof updateAssetBodySchema>;
