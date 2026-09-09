import { z } from 'zod';
import { isValidCronExpression } from '../../../common/utils/cron.js';

export const updateSyncScheduleSchema = z
  .object({
    scheduleExpression: z
      .string()
      .trim()
      .min(1, 'Schedule expression cannot be empty')
      .max(100, 'Schedule expression cannot exceed 100 characters')
      .refine(
        (expr) => isValidCronExpression(expr),
        'Invalid cron expression format (must be 5 fields or supported alias like @hourly, @daily)',
      )
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => data.scheduleExpression !== undefined || data.isActive !== undefined,
    'At least one field (scheduleExpression or isActive) must be provided for update',
  );

export type UpdateSyncScheduleDto = z.infer<typeof updateSyncScheduleSchema>;
