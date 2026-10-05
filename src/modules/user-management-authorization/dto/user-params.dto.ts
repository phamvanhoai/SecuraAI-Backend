import { z } from 'zod';

export const userParamsSchema = z.object({ userId: z.uuid() }).strict();

export type UserParams = z.infer<typeof userParamsSchema>;
