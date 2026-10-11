import { z } from 'zod';

export const markAiAlertFurtherInvestigationSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(10, 'Investigation reason must be at least 10 characters')
      .max(2000, 'Investigation reason must be 2,000 characters or fewer'),
  })
  .strict();

export type MarkAiAlertFurtherInvestigation = z.infer<
  typeof markAiAlertFurtherInvestigationSchema
>;
