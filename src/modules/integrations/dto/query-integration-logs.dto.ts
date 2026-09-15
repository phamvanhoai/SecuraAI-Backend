import { z } from 'zod';

export const queryIntegrationLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  level: z.enum(['info', 'warn', 'error']).optional(),
  integrationId: z.string().uuid('Invalid integrationId format').optional(),
  syncJobId: z.string().uuid('Invalid syncJobId format').optional(),
  search: z.string().trim().max(100, 'Search keyword cannot exceed 100 characters').optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export type QueryIntegrationLogsDto = z.infer<typeof queryIntegrationLogsSchema>;

export const queryIntegrationLogStatsSchema = z.object({
  integrationId: z.string().uuid('Invalid integrationId format').optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export type QueryIntegrationLogStatsDto = z.infer<typeof queryIntegrationLogStatsSchema>;
