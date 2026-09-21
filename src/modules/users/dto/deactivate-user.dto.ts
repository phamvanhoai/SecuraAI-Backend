import { z } from 'zod';

export const deactivateUserParamsSchema = z.strictObject({ userId: z.uuid() });
export const deactivateUserBodySchema = z.strictObject({
  reason: z.string().normalize('NFKC').trim().min(10).max(1000),
});
export type DeactivateUserBody = z.infer<typeof deactivateUserBodySchema>;
