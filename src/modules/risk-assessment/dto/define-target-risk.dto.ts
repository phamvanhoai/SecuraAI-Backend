import { z } from 'zod';
export const defineTargetRiskParamsSchema = z.object({ riskId: z.uuid() });
export const defineTargetRiskBodySchema = z
  .object({
    treatmentPlanId: z.uuid(),
    targetRisk: z.enum(['low', 'medium', 'high', 'critical']),
    rationale: z.string().trim().min(10).max(3000),
  })
  .strict();
export type DefineTargetRiskBody = z.infer<typeof defineTargetRiskBodySchema>;
