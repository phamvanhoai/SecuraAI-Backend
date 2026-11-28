import { z } from 'zod';

// Validate request data for submit policy for review params.
export const submitPolicyForReviewParamsSchema = z.object({
  policyId: z.uuid(),
  versionId: z.uuid(),
});

export type SubmitPolicyForReviewParams = z.infer<typeof submitPolicyForReviewParamsSchema>;
