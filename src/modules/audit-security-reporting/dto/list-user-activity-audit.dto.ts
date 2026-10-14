import { z } from 'zod';

export const listUserActivityAuditQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    outcome: z.enum(['SUCCESS', 'FAILURE', 'DENIED']).optional(),
    resourceType: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type ListUserActivityAuditQuery = z.infer<typeof listUserActivityAuditQuerySchema>;
