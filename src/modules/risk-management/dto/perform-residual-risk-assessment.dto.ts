import { z } from 'zod';

export const residualRiskAssessmentParamsSchema = z.object({
  riskAssessmentId: z.uuid(),
});

export const performResidualRiskAssessmentBodySchema = z.strictObject({
  residualLikelihood: z.number().int().min(1).max(5),
  residualImpact: z.number().int().min(1).max(5),
  assessmentNote: z.string().trim().min(10).max(2_000),
  expectedUpdatedAt: z.union([z.iso.datetime({ offset: true }), z.date()]).pipe(z.coerce.date()),
});

export type PerformResidualRiskAssessmentBody = z.infer<
  typeof performResidualRiskAssessmentBodySchema
>;
