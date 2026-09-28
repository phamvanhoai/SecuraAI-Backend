import { z } from 'zod';

export const rejectPolicyParamsSchema = z.strictObject({
  policyId: z.uuid(),
  versionId: z.uuid(),
});

export const rejectPolicyBodySchema = z.strictObject({
  reason: z.string().trim().min(3).max(5_000),
});

export const rejectedPolicyQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type RejectPolicyBody = z.infer<typeof rejectPolicyBodySchema>;
export type RejectedPolicyQuery = z.infer<typeof rejectedPolicyQuerySchema>;
