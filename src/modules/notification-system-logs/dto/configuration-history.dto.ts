import { z } from 'zod';

export const configurationHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  actor: z.string().trim().max(255).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type ConfigurationHistoryQuery = z.infer<typeof configurationHistoryQuerySchema>;
