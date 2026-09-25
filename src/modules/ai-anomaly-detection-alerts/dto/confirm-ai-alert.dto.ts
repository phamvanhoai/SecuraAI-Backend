import { z } from 'zod';

export const confirmAiAlertSchema = z
  .object({
    comment: z.string().trim().max(2000).optional(),
  })
  .strict();

export type ConfirmAiAlert = z.infer<typeof confirmAiAlertSchema>;
