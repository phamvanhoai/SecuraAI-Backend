import { z } from 'zod';
export const submitRiskAcceptanceParamsSchema = z.object({ riskId: z.uuid() });
export const submitRiskAcceptanceBodySchema = z.object({
  residualLikelihood: z.number().int().min(1).max(5), residualImpact: z.number().int().min(1).max(5),
  assessmentReason: z.string().trim().min(10).max(2000), treatmentPlanId: z.uuid(),
  treatmentPlanStatus: z.enum(['draft', 'active', 'completed']), validUntil: z.iso.date(), acceptanceReason: z.string().trim().min(10).max(2000),
}).strict();
export const decideRiskAcceptanceParamsSchema = z.object({ acceptanceId: z.uuid() });
export const decideRiskAcceptanceBodySchema = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().trim().min(10).max(2000) }).strict();
export type SubmitRiskAcceptanceBody = z.infer<typeof submitRiskAcceptanceBodySchema>;
export type DecideRiskAcceptanceBody = z.infer<typeof decideRiskAcceptanceBodySchema>;
