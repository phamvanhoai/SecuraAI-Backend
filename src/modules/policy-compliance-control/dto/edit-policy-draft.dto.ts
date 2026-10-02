import { z } from 'zod';

export const editPolicyDraftParamsSchema = z
  .object({ policyId: z.uuid(), versionId: z.uuid() })
  .strict();

export const editPolicyDraftBodySchema = z
  .object({
    title: z.string().trim().min(3).max(255).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    versionNumber: z.string().trim().min(1).max(30).optional(),
    content: z.string().trim().min(1).max(500_000).optional(),
    changeSummary: z.string().trim().max(5_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export type EditPolicyDraftBody = z.infer<typeof editPolicyDraftBodySchema>;
