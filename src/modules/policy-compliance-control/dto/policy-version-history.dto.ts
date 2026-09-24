import { z } from 'zod';

export const listPolicyVersionHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(255).optional(),
    status: z.enum(['all', 'draft', 'published', 'archived']).default('all'),
  })
  .strict();

export const policyVersionHistoryParamsSchema = z
  .object({ policyId: z.uuid(), versionId: z.uuid() })
  .strict();

export type ListPolicyVersionHistoryQuery = z.infer<typeof listPolicyVersionHistoryQuerySchema>;
