import { z } from 'zod';

export const reminderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['all', 'unread']).default('all'),
  search: z.string().trim().max(100).optional(),
});
export const reminderParamsSchema = z.object({ notificationId: z.string().uuid() });
export type ReminderQuery = z.infer<typeof reminderQuerySchema>;
