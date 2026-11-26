import { z } from 'zod';

// Validate the incident ID used by option and create-link routes.
export const incidentControlParamsSchema = z.object({ incidentId: z.uuid() }).strict();
// Validate both IDs used by the unlink route.
export const incidentControlLinkParamsSchema = z
  .object({ incidentId: z.uuid(), controlId: z.uuid() })
  .strict();
// Validate the control selected for a new incident link.
export const linkIncidentControlBodySchema = z.object({ controlId: z.uuid() }).strict();
// Validate search, link state and bounded pagination for the control picker.
export const incidentControlOptionsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    scope: z.enum(['linked', 'unlinked']).default('unlinked'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
export type LinkIncidentControlInput = z.infer<typeof linkIncidentControlBodySchema>;
export type IncidentControlOptionsQuery = z.infer<typeof incidentControlOptionsQuerySchema>;
