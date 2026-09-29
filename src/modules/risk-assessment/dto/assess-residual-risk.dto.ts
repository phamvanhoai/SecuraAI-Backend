import { z } from 'zod';
const rating = z.enum(['low', 'medium', 'high', 'critical']);
export const assessResidualRiskParamsSchema = z.object({ riskId: z.uuid() });
export const assessResidualRiskBodySchema = z
  .object({
    likelihood: z.coerce.number().int().min(1).max(5),
    impact: z.coerce.number().int().min(1).max(5),
    targetRisk: rating,
    riskAppetite: rating,
    riskTolerance: rating,
    assessmentReason: z.string().trim().min(10).max(3000),
  })
  .strict();
export type AssessResidualRiskBody = z.infer<typeof assessResidualRiskBodySchema>;
