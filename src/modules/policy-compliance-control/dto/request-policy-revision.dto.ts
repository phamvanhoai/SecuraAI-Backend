import { z } from 'zod';

export const requestPolicyRevisionParamsSchema = z.strictObject({
  policyId: z.uuid(),
  versionId: z.uuid(),
});

export const requestPolicyRevisionBodySchema = z.strictObject({
  comment: z.string().trim().min(3).max(5_000),
});

export type RequestPolicyRevisionBody = z.infer<typeof requestPolicyRevisionBodySchema>;
