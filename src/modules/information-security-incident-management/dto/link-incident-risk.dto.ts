import { z } from 'zod';
export const incidentRiskParamsSchema = z.object({ incidentId: z.uuid() }).strict();
export const incidentRiskLinkParamsSchema = z
  .object({ incidentId: z.uuid(), riskId: z.uuid() })
  .strict();
export const linkIncidentRiskBodySchema = z.object({ riskId: z.uuid() }).strict();
export const incidentRiskOptionsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    scope: z.enum(['linked', 'unlinked']).default('unlinked'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
export type LinkIncidentRiskInput = z.infer<typeof linkIncidentRiskBodySchema>;
export type IncidentRiskOptionsQuery = z.infer<typeof incidentRiskOptionsQuerySchema>;
