import { z } from 'zod';

// Validate request data for reject policy params.
export const rejectPolicyParamsSchema = z.strictObject({
  policyId: z.uuid(),
  versionId: z.uuid(),
});

// Validate request data for reject policy body.
export const rejectPolicyBodySchema = z.strictObject({
  reason: z.string().trim().min(3).max(5_000),
});

// Validate request data for rejected policy query.
export const rejectedPolicyQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type RejectPolicyBody = z.infer<typeof rejectPolicyBodySchema>;
export type RejectedPolicyQuery = z.infer<typeof rejectedPolicyQuerySchema>;
