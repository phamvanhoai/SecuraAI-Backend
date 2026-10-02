import { z } from 'zod';
export const controlWeaknessParamsSchema = z.object({ incidentId: z.uuid() }).strict();
export const controlWeaknessHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
export const recordControlWeaknessBodySchema = z
  .object({
    controlId: z.uuid(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    description: z.string().trim().min(20).max(5000),
  })
  .strict();
export type RecordControlWeaknessInput = z.infer<typeof recordControlWeaknessBodySchema>;
export type ControlWeaknessHistoryQuery = z.infer<typeof controlWeaknessHistoryQuerySchema>;
