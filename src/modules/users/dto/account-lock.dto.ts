import { z } from 'zod';

export const accountLockParamsSchema = z.strictObject({ userId: z.uuid() });
export const accountLockBodySchema = z.strictObject({
  reason: z
    .string({ error: 'Reason must be a string' })
    .normalize('NFKC')
    .trim()
    .min(10, 'Reason must contain at least 10 characters')
    .max(1000, 'Reason must contain at most 1000 characters'),
});
export type AccountLockBody = z.infer<typeof accountLockBodySchema>;
