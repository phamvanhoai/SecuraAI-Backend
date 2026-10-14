import { z } from 'zod';

export const policyVersionHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['all', 'published', 'archived']).default('all'),
});

export const policyVersionHistoryParamsSchema = z.object({
  policyId: z.string().uuid(),
  versionId: z.string().uuid(),
});

export type PolicyVersionHistoryQuery = z.infer<typeof policyVersionHistoryQuerySchema>;
