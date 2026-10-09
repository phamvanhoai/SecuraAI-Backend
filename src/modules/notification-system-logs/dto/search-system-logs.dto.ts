import { z } from 'zod';

export const searchSystemLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    eventType: z.string().trim().min(1).max(150).optional(),
    source: z.string().trim().min(1).max(100).optional(),
    actor: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['SUCCESS', 'FAILURE', 'DENIED']).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'From timestamp must not be after to timestamp',
    path: ['to'],
  });

export type SearchSystemLogsQuery = z.infer<typeof searchSystemLogsQuerySchema>;
