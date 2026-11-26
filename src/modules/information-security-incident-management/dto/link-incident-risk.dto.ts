import { z } from 'zod';
// Validate the incident ID used by option and create-link routes.
export const incidentRiskParamsSchema = z.object({ incidentId: z.uuid() }).strict();
// Validate both IDs used by the unlink route.
export const incidentRiskLinkParamsSchema = z
  .object({ incidentId: z.uuid(), riskId: z.uuid() })
  .strict();
// Validate the risk selected for a new incident link.
export const linkIncidentRiskBodySchema = z.object({ riskId: z.uuid() }).strict();
// Validate search, link state and bounded pagination for the risk picker.
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
