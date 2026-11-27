import { z } from 'zod';
import { assetTypeSchema } from './asset-type.dto.js';

const optionalUuid = z.uuid().optional();

export const createAssetBodySchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    assetType: assetTypeSchema,
    ownerUserId: optionalUuid,
    description: z.string().trim().max(2000).refine((value) => value.length === 0 || value.length >= 20, "Enter at least 20 characters or leave blank.").optional(),
  })
  .strict();

export type CreateAssetInput = z.infer<typeof createAssetBodySchema>;
