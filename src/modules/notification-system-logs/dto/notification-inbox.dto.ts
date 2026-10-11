import { z } from 'zod';
export const notificationInboxQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20), unread: z.enum(['true','false']).optional() });
export type NotificationInboxQuery = z.infer<typeof notificationInboxQuerySchema>;
