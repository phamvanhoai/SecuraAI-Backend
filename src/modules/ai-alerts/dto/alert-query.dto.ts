import { z } from 'zod';

export const alertStatuses = [
  'new',
  'reviewing',
  'confirmed',
  'false_positive',
  'resolved',
  'dismissed',
] as const;

export const listAlertsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(alertStatuses).optional(),
    assetId: z.uuid().optional(),
    logSourceId: z.uuid().optional(),
    detectedAfter: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
