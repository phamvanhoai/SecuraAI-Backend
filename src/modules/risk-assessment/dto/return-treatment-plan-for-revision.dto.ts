import { z } from 'zod';

const normalizedReason = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value.normalize('NFKC').replace(/\s+/gu, ' ').trim()
      : value,
  z.string().min(10).max(1_000),
);

export const returnTreatmentPlanForRevisionParamsSchema = z.strictObject({
  treatmentPlanId: z.uuid(),
});

export const returnTreatmentPlanForRevisionBodySchema = z.strictObject({
  approvalRequestId: z.uuid(),
  revisionScope: z.enum(['risk_assessment', 'treatment_plan', 'both']),
  reason: normalizedReason,
});

export type ReturnTreatmentPlanForRevisionBody = z.infer<
  typeof returnTreatmentPlanForRevisionBodySchema
>;
