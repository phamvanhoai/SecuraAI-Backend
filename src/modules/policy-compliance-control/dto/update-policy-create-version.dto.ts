import { z } from 'zod';

export const updatePolicyCreateVersionParamsSchema = z.object({ policyId: z.uuid() }).strict();

export const updatePolicyCreateVersionBodySchema = z
  .object({
    title: z.string().trim().min(3).max(255).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    versionNumber: z.string().trim().min(1).max(30),
    content: z.string().trim().min(1).max(500_000),
    changeSummary: z.string().trim().min(1).max(5_000),
  })
  .strict();

export type UpdatePolicyCreateVersionInput = z.infer<typeof updatePolicyCreateVersionBodySchema>;
