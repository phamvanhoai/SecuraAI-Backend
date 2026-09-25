import { z } from 'zod';

export const listAiAlertsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    status: z
      .enum(['new', 'reviewing', 'confirmed', 'false_positive', 'resolved', 'dismissed'])
      .optional(),
    detectedAfter: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type ListAiAlertsQuery = z.infer<typeof listAiAlertsQuerySchema>;
