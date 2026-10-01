import { z } from 'zod';

const nullableUuid = z.union([z.uuid(), z.null()]);

export const linkAssetContextBodySchema = z.object({
  businessServiceId: nullableUuid,
  dependencyIds: z.array(z.uuid()).max(50).refine((ids) => new Set(ids).size === ids.length, 'Duplicate dependencies are not allowed'),
  eventSourceIds: z.array(z.uuid()).max(50).refine((ids) => new Set(ids).size === ids.length, 'Duplicate event sources are not allowed'),
}).strict();

export type LinkAssetContextInput = z.infer<typeof linkAssetContextBodySchema>;
