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

export type ListOwnedReassessmentRequestsQuery = z.infer<
  typeof listOwnedReassessmentRequestsQuerySchema
>;
