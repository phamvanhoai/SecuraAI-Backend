import { z } from 'zod';

// Validate request data for request policy revision params.
export const requestPolicyRevisionParamsSchema = z.strictObject({
  policyId: z.uuid(),
  versionId: z.uuid(),
});

// Validate request data for request policy revision body.
export const requestPolicyRevisionBodySchema = z.strictObject({
  comment: z.string().trim().min(3).max(5_000),
});

export type RequestPolicyRevisionBody = z.infer<typeof requestPolicyRevisionBodySchema>;
