import { z } from 'zod';

export const approveTreatmentPlanParamsSchema = z.strictObject({
  treatmentPlanId: z.uuid(),
});

export const approveTreatmentPlanBodySchema = z.strictObject({
  approvalRequestId: z.uuid(),
  comment: z.string().trim().max(1000).optional(),
});

export type ApproveTreatmentPlanBody = z.infer<typeof approveTreatmentPlanBodySchema>;
