import { z } from 'zod';

export const syncJobStatusEnum = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);

export const querySyncJobsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: syncJobStatusEnum.optional(),
  syncScheduleId: z.string().uuid('Invalid syncScheduleId format').optional(),
  sortBy: z.enum(['createdAt', 'startedAt', 'completedAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QuerySyncJobsDto = z.infer<typeof querySyncJobsSchema>;
export type SyncJobStatus = z.infer<typeof syncJobStatusEnum>;
