import { z } from 'zod';

export const regenerateAlertExplanationSchema = z
  .object({
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export type RegenerateAlertExplanation = z.infer<typeof regenerateAlertExplanationSchema>;
