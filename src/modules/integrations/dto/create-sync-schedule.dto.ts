import { z } from 'zod';
import { isValidCronExpression } from '@/common/utils/cron.js';

export const createSyncScheduleSchema = z.object({
  scheduleExpression: z
    .string()
    .trim()
    .min(1, 'Schedule expression is required')
    .max(100, 'Schedule expression cannot exceed 100 characters')
    .refine(
      (expr) => isValidCronExpression(expr),
      'Invalid cron expression format (must be 5 fields or supported alias like @hourly, @daily)',
    ),
  isActive: z.boolean().optional(),
});

export type CreateSyncScheduleDto = z.infer<typeof createSyncScheduleSchema>;
