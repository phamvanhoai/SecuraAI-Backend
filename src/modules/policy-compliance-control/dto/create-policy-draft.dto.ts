import { z } from 'zod';

export const createPolicyDraftBodySchema = z
  .object({
    policyCode: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
      .transform((value) => value.toUpperCase()),
    title: z.string().trim().min(3).max(255),
    description: z.string().trim().max(2_000).optional(),
    versionNumber: z.string().trim().min(1).max(30),
    content: z.string().trim().min(1).max(500_000),
  })
  .strict();

export type CreatePolicyDraftBody = z.infer<typeof createPolicyDraftBodySchema>;
