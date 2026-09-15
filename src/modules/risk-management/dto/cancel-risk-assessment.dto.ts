import { z } from 'zod';

export const cancelRiskAssessmentBodySchema = z.strictObject({
  reason: z.string().trim().min(10).max(1000),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

export type CancelRiskAssessmentBody = z.infer<typeof cancelRiskAssessmentBodySchema>;
