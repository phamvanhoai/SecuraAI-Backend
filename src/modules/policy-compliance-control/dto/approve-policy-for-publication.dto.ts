import { z } from 'zod';

// Validate request data for approve policy for publication params.
export const approvePolicyForPublicationParamsSchema = z.strictObject({
  policyId: z.uuid(),
  versionId: z.uuid(),
});
