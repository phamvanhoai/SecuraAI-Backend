import { z } from 'zod';

export const falsePositiveBodySchema = z
  .object({
    comment: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type FalsePositiveBody = z.infer<typeof falsePositiveBodySchema>;
