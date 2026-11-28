import { z } from 'zod';

// Validate request data for incident progress.
export const incidentProgressSchema = z
  .object({
    status: z.enum(['triage', 'containment', 'eradication', 'recovery', 'lessons_learned']),
    expectedStatus: z.enum(['open', 'triage', 'containment', 'eradication', 'recovery']),
    expectedUpdatedAt: z.iso.datetime(),
    confirmed: z.literal(true),
    note: z.string().trim().min(10).max(2000),
    skipReason: z.string().trim().min(10).max(2000).optional(),
  })
  .strict();
export type IncidentProgress = z.infer<typeof incidentProgressSchema>;
// Validate request data for phase history query.
export const phaseHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
