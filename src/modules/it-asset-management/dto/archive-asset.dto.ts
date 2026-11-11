import { z } from 'zod';

export const archiveAssetBodySchema = z.object({
  reason: z.string().trim().min(20, "Enter at least 20 characters.").max(1000),
}).strict();
export type ArchiveAssetInput = z.infer<typeof archiveAssetBodySchema>;
