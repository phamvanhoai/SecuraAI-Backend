import { z } from 'zod';

export const getUserParamsSchema = z.object({
  userId: z.uuid(),
});

export type GetUserParams = z.infer<typeof getUserParamsSchema>;
