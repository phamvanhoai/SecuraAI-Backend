import { z } from 'zod';

export const listPolicyControlMappingsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const frameworkControlsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    q: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const frameworkParamsSchema = z.object({ frameworkId: z.uuid() }).strict();

export const policyFrameworkMappingParamsSchema = z
  .object({ policyId: z.uuid(), versionId: z.uuid(), frameworkId: z.uuid() })
  .strict();

export const replacePolicyControlMappingsBodySchema = z
  .object({
    mappings: z
      .array(
        z.object({
          controlId: z.uuid(),
          notes: z.string().trim().max(1000).nullable().optional(),
        }),
      )
      .max(100)
      .refine(
        (items) => new Set(items.map((item) => item.controlId)).size === items.length,
        'Control mappings must be unique',
      ),
  })
  .strict();

export type ListPolicyControlMappingsQuery = z.infer<typeof listPolicyControlMappingsQuerySchema>;
export type FrameworkControlsQuery = z.infer<typeof frameworkControlsQuerySchema>;
export type ReplacePolicyControlMappingsInput = z.infer<
  typeof replacePolicyControlMappingsBodySchema
>;
