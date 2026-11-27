import { z } from 'zod';
// Validate the incident selected for weakness history, options or creation.
export const controlWeaknessParamsSchema = z.object({ incidentId: z.uuid() }).strict();
// Validate bounded pagination for weakness history.
export const controlWeaknessHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
// Validate the control, severity and supporting description for a new weakness.
export const recordControlWeaknessBodySchema = z
  .object({
    controlId: z.uuid(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    description: z.string().trim().min(20).max(5000),
  })
  .strict();
export type RecordControlWeaknessInput = z.infer<typeof recordControlWeaknessBodySchema>;
export type ControlWeaknessHistoryQuery = z.infer<typeof controlWeaknessHistoryQuerySchema>;
