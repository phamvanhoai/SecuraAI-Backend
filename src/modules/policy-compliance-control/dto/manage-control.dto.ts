import { z } from 'zod';
const fields = {
  name: z.string().trim().min(3).max(255),
  description: z.string().trim().min(10).max(5000),
  ownerUserId: z.uuid().nullable(),
  applicability: z.enum(['applicable', 'not_applicable', 'under_review']),
  implementationStatus: z.enum([
    'not_implemented',
    'planned',
    'partially_implemented',
    'implemented',
  ]),
};
export const createControlSchema = z
  .object({
    controlCode: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(100)
      .regex(/^[A-Z0-9][A-Z0-9._-]*$/),
    ...fields,
  })
  .strict();
export const editControlSchema = z
  .object({
    ...fields,
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();
export const controlParamsSchema = z.object({ controlId: z.uuid() }).strict();
export const controlOwnerQuerySchema = z
  .object({ q: z.string().trim().max(100).default('') })
  .strict();
export type CreateControlInput = z.infer<typeof createControlSchema>;
export type EditControlInput = z.infer<typeof editControlSchema>;
