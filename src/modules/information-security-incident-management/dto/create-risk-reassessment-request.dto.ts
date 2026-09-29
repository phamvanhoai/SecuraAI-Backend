import { z } from 'zod';

export const riskReassessmentRequestParamsSchema = z
  .object({ incidentId: z.uuid() })
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
