import { z } from 'zod';
import { assetStatuses } from './list-assets-query.dto.js';

const nullableText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(maxLength).nullable().optional(),
  );

const metadataSchema = z
  .record(z.string(), z.json())
  .refine((value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 20_000, {
    message: 'Metadata must not exceed 20 KB',
  });

export const updateAssetParamsSchema = z.object({ assetId: z.uuid() });

export const updateAssetBodySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    assetType: z.string().trim().min(1).max(50).optional(),
    description: nullableText(10_000),
    departmentId: z.uuid().nullable().optional(),
    hostname: nullableText(255),
    ipAddress: z.union([z.ipv4(), z.ipv6()]).nullable().optional(),
    location: nullableText(255),
    status: z.enum(assetStatuses).optional(),
    metadata: metadataSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateAssetBody = z.infer<typeof updateAssetBodySchema>;
export type UpdateAssetParams = z.infer<typeof updateAssetParamsSchema>;
