import { z } from 'zod';

export const archiveAssetBodySchema = z.object({
  reason: z.string().trim().min(1).max(1000),
}).strict();
export type ArchiveAssetInput = z.infer<typeof archiveAssetBodySchema>;
