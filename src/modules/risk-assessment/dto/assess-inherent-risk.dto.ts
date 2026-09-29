import { z } from 'zod';

export const assessInherentRiskParamsSchema = z.object({ riskId: z.uuid() });
export const assessInherentRiskBodySchema = z
  .object({
    likelihood: z.coerce.number().int().min(1).max(5),
    impact: z.coerce.number().int().min(1).max(5),
    assessmentReason: z.string().trim().min(10).max(3000),
  })
  .strict();
export type AssessInherentRiskBody = z.infer<typeof assessInherentRiskBodySchema>;
