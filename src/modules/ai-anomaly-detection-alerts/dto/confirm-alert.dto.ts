import { z } from 'zod';

export const confirmAlertBodySchema = z
  .object({ comment: z.string().trim().min(1).max(2000).optional() })
  .strict();

export type ConfirmAlertBody = z.infer<typeof confirmAlertBodySchema>;
