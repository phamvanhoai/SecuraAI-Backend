import { z } from 'zod';

export const classifyIncidentSeveritySchema = z
  .object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    rationale: z.string().trim().min(10).max(2000),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .strict();

export type ClassifyIncidentSeverity = z.infer<typeof classifyIncidentSeveritySchema>;

export const classificationHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
