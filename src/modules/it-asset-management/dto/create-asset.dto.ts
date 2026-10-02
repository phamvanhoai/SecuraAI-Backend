import { z } from 'zod';

const optionalUuid = z.uuid().optional();

export const createAssetBodySchema = z
  .object({
    assetCode: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1).max(255),
    assetType: z.string().trim().min(1).max(100),
    businessServiceId: optionalUuid,
    ownerUserId: optionalUuid,
  criticality: z
    .enum(['low', 'medium', 'high', 'critical']),
    dataClassification: z.enum(['public', 'internal', 'confidential', 'restricted']),
    description: z.string().trim().max(10_000).optional(),
    dependencies: z
      .array(
        z.object({
          assetId: z.uuid(),
          type: z.string().trim().max(100).optional(),
          description: z.string().trim().max(2_000).optional(),
        }),
      )
      .max(50)
      .default([]),
    eventSourceIds: z.array(z.uuid()).max(50).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const dependencyIds = value.dependencies.map((item) => item.assetId);
    if (new Set(dependencyIds).size !== dependencyIds.length)
      context.addIssue({
        code: 'custom',
        path: ['dependencies'],
        message: 'Duplicate dependencies are not allowed',
      });
    if (new Set(value.eventSourceIds).size !== value.eventSourceIds.length)
      context.addIssue({
        code: 'custom',
        path: ['eventSourceIds'],
        message: 'Duplicate event sources are not allowed',
      });
  });

export type CreateAssetInput = z.infer<typeof createAssetBodySchema>;
