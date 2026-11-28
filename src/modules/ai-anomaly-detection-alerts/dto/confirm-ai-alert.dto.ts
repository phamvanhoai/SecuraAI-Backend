import { z } from 'zod';

// Validate the optional analyst comment used when confirming an alert.
export const confirmAiAlertSchema = z
  .object({
    comment: z.string().trim().max(2000).optional(),
  })
  .strict();

export type ConfirmAiAlert = z.infer<typeof confirmAiAlertSchema>;
