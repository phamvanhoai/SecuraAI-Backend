import { z } from 'zod';

export const markAiAlertFalsePositiveSchema = z
  .object({ comment: z.string().trim().max(2000).optional() })
  .strict();

export type MarkAiAlertFalsePositive = z.infer<typeof markAiAlertFalsePositiveSchema>;
