import { z } from 'zod';

export const submitPolicyForReviewParamsSchema = z.object({
  policyId: z.uuid(),
  versionId: z.uuid(),
});

export type SubmitPolicyForReviewParams = z.infer<typeof submitPolicyForReviewParamsSchema>;
