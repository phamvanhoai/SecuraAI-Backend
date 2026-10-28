import { z } from 'zod';
export const completeRiskReviewSchema = z.object({
  conclusion: z.string().trim().min(10).max(2000), nextReviewDate: z.iso.date(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  expectedOpenedAt: z.iso.datetime({ offset: true }), assessmentId: z.uuid(),
}).strict();
export type CompleteRiskReview = z.infer<typeof completeRiskReviewSchema>;
