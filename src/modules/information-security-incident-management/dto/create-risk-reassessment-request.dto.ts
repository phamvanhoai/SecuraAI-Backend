import { z } from 'zod';

export const riskReassessmentRequestParamsSchema = z.object({ incidentId: z.uuid() }).strict();

export const riskReassessmentRequestHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();

export const createRiskReassessmentRequestBodySchema = z
  .object({
    riskId: z.uuid(),
    controlFindingId: z.uuid().optional(),
    reason: z.string().trim().min(20).max(5000),
  })
  .strict();

export type CreateRiskReassessmentRequestInput = z.infer<
  typeof createRiskReassessmentRequestBodySchema
>;
export type RiskReassessmentRequestHistoryQuery = z.infer<
  typeof riskReassessmentRequestHistoryQuerySchema
>;
