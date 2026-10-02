import { z } from 'zod';

export const approvePolicyForPublicationParamsSchema = z.strictObject({
  policyId: z.uuid(),
  versionId: z.uuid(),
});
