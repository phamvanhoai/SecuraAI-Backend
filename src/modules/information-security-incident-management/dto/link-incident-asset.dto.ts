import { z } from 'zod';

// Validate the incident ID used by option and create-link routes.
export const incidentIdParamsSchema = z.object({ incidentId: z.uuid() }).strict();

// Validate both IDs used by the unlink route.
export const incidentAssetParamsSchema = z
  .object({ incidentId: z.uuid(), assetId: z.uuid() })
  .strict();

// Validate the asset selected for a new incident link.
export const linkIncidentAssetBodySchema = z.object({ assetId: z.uuid() }).strict();

// Validate search, link state and bounded pagination for the asset picker.
export const incidentAssetOptionsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    scope: z.enum(['linked', 'unlinked']).default('unlinked'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

export type LinkIncidentAssetInput = z.infer<typeof linkIncidentAssetBodySchema>;
export type IncidentAssetOptionsQuery = z.infer<typeof incidentAssetOptionsQuerySchema>;
