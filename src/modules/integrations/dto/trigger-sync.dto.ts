import { z } from 'zod';

export const triggerSyncSchema = z.object({
  syncScheduleId: z.string().uuid('Invalid syncScheduleId format').optional(),
});

export type TriggerSyncDto = z.infer<typeof triggerSyncSchema>;
