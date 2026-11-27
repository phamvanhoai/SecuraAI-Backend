import { z } from 'zod';

// Validate the optional analyst comment used for a false-positive decision.
export const markAiAlertFalsePositiveSchema = z
  .object({ comment: z.string().trim().max(2000).optional() })
  .strict();

export type MarkAiAlertFalsePositive = z.infer<typeof markAiAlertFalsePositiveSchema>;
