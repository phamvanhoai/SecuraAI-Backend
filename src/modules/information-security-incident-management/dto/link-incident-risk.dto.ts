import { z } from 'zod';
export const incidentRiskParamsSchema = z.object({ incidentId: z.uuid() }).strict();
export const linkIncidentRiskBodySchema = z.object({ riskId: z.uuid() }).strict();
export type LinkIncidentRiskInput = z.infer<typeof linkIncidentRiskBodySchema>;
