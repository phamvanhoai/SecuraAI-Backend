import { z } from 'zod';

export const incidentIdParamsSchema = z.object({ incidentId: z.uuid() }).strict();

export const linkIncidentAssetBodySchema = z.object({ assetId: z.uuid() }).strict();

export type LinkIncidentAssetInput = z.infer<typeof linkIncidentAssetBodySchema>;
