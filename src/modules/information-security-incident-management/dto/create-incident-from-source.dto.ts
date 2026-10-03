import { z } from 'zod';

export const incidentSourceOptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
});

const incidentDetailsSchema = z.object({
  title: z.string().trim().min(5).max(255),
  description: z.string().trim().min(20).max(10_000),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  detectedAt: z.coerce.date().optional(),
});

export const createIncidentFromSourceSchema = z.discriminatedUnion('sourceType', [
  incidentDetailsSchema.extend({
    sourceType: z.enum(['alert', 'finding']),
    sourceId: z.string().uuid(),
  }),
  incidentDetailsSchema.extend({
    sourceType: z.literal('manual'),
  }),
]);

export type IncidentSourceOptionsQuery = z.infer<typeof incidentSourceOptionsQuerySchema>;
export type CreateIncidentFromSource = z.infer<typeof createIncidentFromSourceSchema>;
