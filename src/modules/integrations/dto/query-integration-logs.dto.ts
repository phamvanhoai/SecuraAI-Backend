import { z } from 'zod';

export const queryIntegrationLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  level: z.enum(['info', 'warn', 'error']).optional(),
  syncJobId: z.string().uuid('Invalid syncJobId format').optional(),
});

export type QueryIntegrationLogsDto = z.infer<typeof queryIntegrationLogsSchema>;
