import { z } from 'zod';
export const controlWeaknessParamsSchema = z.object({ incidentId: z.uuid() }).strict();
export const recordControlWeaknessBodySchema = z
  .object({
    controlId: z.uuid(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    description: z.string().trim().min(20).max(5000),
  })
  .strict();
export type RecordControlWeaknessInput = z.infer<typeof recordControlWeaknessBodySchema>;
