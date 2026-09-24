import { z } from 'zod';

const optionalText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(maxLength).optional(),
  );

const metadataSchema = z
  .record(z.string(), z.json())
  .refine((value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 20_000, {
    message: 'Metadata must not exceed 20 KB',
  });

export const createAssetBodySchema = z
  .object({
    assetCode: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Invalid asset code format')),
    name: z.string().trim().min(1).max(150),
    assetType: z.string().trim().min(1).max(50),
    description: optionalText(10_000),
    departmentId: z.uuid().optional(),
    ownerUserId: z.uuid().optional(),
    hostname: optionalText(255),
    ipAddress: z.union([z.ipv4(), z.ipv6()]).optional(),
    location: optionalText(255),
    metadata: metadataSchema.optional(),
  })
  .strict();

export type CreateAssetBody = z.infer<typeof createAssetBodySchema>;
