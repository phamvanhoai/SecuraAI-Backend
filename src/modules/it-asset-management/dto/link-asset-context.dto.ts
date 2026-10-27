import { z } from 'zod';

const nullableUuid = z.union([z.uuid(), z.null()]);

export const linkAssetContextBodySchema = z.object({
  businessServiceId: nullableUuid,
  dependencyIds: z.array(z.uuid()).max(50).refine((ids) => new Set(ids).size === ids.length, 'Duplicate dependencies are not allowed'),
  eventSourceIds: z.array(z.uuid()).max(50).refine((ids) => new Set(ids).size === ids.length, 'Duplicate event sources are not allowed'),
}).strict();

export type LinkAssetContextInput = z.infer<typeof linkAssetContextBodySchema>;

export const assetContextHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
}).strict();
const reference = z.object({ id: z.uuid(), name: z.string() });
export const assetContextSnapshotSchema = z.object({
  businessService: reference.nullable(),
  dependencies: z.array(reference.extend({ assetCode: z.string() })),
  eventSources: z.array(reference),
});
export type AssetContextHistoryQuery = z.infer<typeof assetContextHistoryQuerySchema>;
