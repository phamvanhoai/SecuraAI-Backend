import { z } from 'zod';

export const deactivateBusinessServiceSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    confirmationName: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, ' '))
      .pipe(z.string().min(1).max(255)),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export type DeactivateBusinessServiceInput = z.infer<typeof deactivateBusinessServiceSchema>;
