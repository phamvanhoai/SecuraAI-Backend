import { z } from 'zod';

export const testConnectionSchema = z.object({
  timeoutMs: z.coerce.number().int().min(1000).max(10000).default(5000),
});

export type TestConnectionDto = z.infer<typeof testConnectionSchema>;
