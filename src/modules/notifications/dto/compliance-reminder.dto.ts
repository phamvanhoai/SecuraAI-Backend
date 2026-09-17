import { z } from 'zod';
export const complianceReminderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['all', 'unread']).default('all'),
  search: z.string().trim().max(100).optional(),
});
export const complianceReminderParamsSchema = z.object({ notificationId: z.uuid() });
export type ComplianceReminderQuery = z.infer<typeof complianceReminderQuerySchema>;
