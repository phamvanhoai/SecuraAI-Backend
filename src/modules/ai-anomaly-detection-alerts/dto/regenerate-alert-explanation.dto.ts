import { z } from 'zod';

// Require a reason before requesting a replacement alert explanation.
export const regenerateAlertExplanationSchema = z
  .object({
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export type RegenerateAlertExplanation = z.infer<typeof regenerateAlertExplanationSchema>;
