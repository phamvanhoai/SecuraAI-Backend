import { z } from 'zod';

export const publishPolicyVersionParamsSchema = z
  .object({ policyId: z.string().uuid(), versionId: z.string().uuid() })
  .strict();

export const publishPolicyVersionBodySchema = z
  .object({ effectiveDate: z.string().date().optional() })
  .strict();

export type PublishPolicyVersionParams = z.infer<typeof publishPolicyVersionParamsSchema>;
export type PublishPolicyVersionBody = z.infer<typeof publishPolicyVersionBodySchema>;
