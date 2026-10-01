import { z } from 'zod';

export const listOwnedReassessmentRequestsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    q: z.string().trim().max(100).optional(),
    status: z
      .enum(['all', 'active', 'pending', 'under_review', 'completed', 'rejected', 'closed'])
      .optional(),
  })
  .strict();

export const reviewRiskReassessmentRequestParamsSchema = z.object({ requestId: z.uuid() }).strict();

export const rejectRiskReassessmentRequestBodySchema = z
  .object({ reason: z.string().trim().min(20).max(2000) })
  .strict();

export const completeRiskReassessmentBodySchema = z
  .object({
    residualLikelihood: z.number().int().min(1).max(5),
    residualImpact: z.number().int().min(1).max(5),
    controlEffectiveness: z.number().min(0).max(100),
    assessmentReason: z.string().trim().min(20).max(5000),
    treatmentPlanId: z.uuid(),
    treatmentPlanStatus: z.enum(['draft', 'active', 'completed']),
    targetDate: z.iso.date(),
  })
  .strict();

export type ListOwnedReassessmentRequestsQuery = z.infer<
  typeof listOwnedReassessmentRequestsQuerySchema
>;
export type CompleteRiskReassessmentInput = z.infer<typeof completeRiskReassessmentBodySchema>;
export type RejectRiskReassessmentRequestInput = z.infer<
  typeof rejectRiskReassessmentRequestBodySchema
>;
