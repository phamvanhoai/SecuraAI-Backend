import { z } from 'zod';

export const incidentControlParamsSchema = z.object({ incidentId: z.uuid() }).strict();
export const linkIncidentControlBodySchema = z.object({ controlId: z.uuid() }).strict();
export type LinkIncidentControlInput = z.infer<typeof linkIncidentControlBodySchema>;
