import { z } from 'zod';

export const getPolicyVersionParamsSchema = z
  .object({
    policyId: z.uuid(),
    versionId: z.uuid(),
  })
  .strict();

export type GetPolicyVersionParams = z.infer<typeof getPolicyVersionParamsSchema>;
