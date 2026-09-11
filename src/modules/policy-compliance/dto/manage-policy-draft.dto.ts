import { z } from 'zod';

export const policyDraftParamsSchema = z
  .object({ policyId: z.uuid(), versionId: z.uuid() })
  .strict();

export const listOwnPolicyDraftsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const updatePolicyDraftSchema = z
  .object({
    title: z.string().trim().min(3).max(255).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    versionNumber: z.string().trim().min(1).max(30).optional(),
    content: z.string().trim().min(1).max(500_000).optional(),
    changeSummary: z.string().trim().max(5_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export type ListOwnPolicyDraftsQuery = z.infer<typeof listOwnPolicyDraftsQuerySchema>;
export type UpdatePolicyDraftInput = z.infer<typeof updatePolicyDraftSchema>;
