import { z } from 'zod';

const incidentStatuses = [
  'open',
  'triage',
  'containment',
  'eradication',
  'recovery',
  'lessons_learned',
  'closed',
] as const;

export const viewIncidentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).max(100).optional(),
  severity: z.string().trim().min(1).max(50).optional(),
  status: z.enum(incidentStatuses).optional(),
});

export const incidentDetailParamsSchema = z.object({ incidentId: z.string().uuid() });

export type ViewIncidentsQuery = z.infer<typeof viewIncidentsQuerySchema>;
