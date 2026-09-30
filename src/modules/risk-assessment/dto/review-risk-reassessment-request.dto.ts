import { z } from 'zod';

export const listOwnedReassessmentRequestsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: z.enum(['pending', 'under_review']).optional(),
  })
  .strict();

export const reviewRiskReassessmentRequestParamsSchema = z
  .object({ requestId: z.uuid() })
  .strict();

export const completeRiskReassessmentBodySchema = z.object({
  residualLikelihood: z.number().int().min(1).max(5),
  residualImpact: z.number().int().min(1).max(5),
  controlEffectiveness: z.number().min(0).max(100),
  assessmentReason: z.string().trim().min(20).max(5000),
  treatmentPlanId: z.uuid(),
  treatmentPlanStatus: z.enum(['draft', 'active', 'completed']),
  targetDate: z.iso.date(),
}).strict();

export type ListOwnedReassessmentRequestsQuery = z.infer<
  typeof listOwnedReassessmentRequestsQuerySchema
>;
export type CompleteRiskReassessmentInput = z.infer<typeof completeRiskReassessmentBodySchema>;
