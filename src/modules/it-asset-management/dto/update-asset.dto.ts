import { z } from 'zod';

export const updateAssetBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  assetType: z.string().trim().min(1).max(100),
  ownerUserId: z.uuid().nullable(),
  businessServiceId: z.uuid().nullable(),
  criticality: z.enum(['low', 'medium', 'high', 'critical']),
  dataClassification: z.string().trim().min(1).max(50),
  description: z.string().trim().max(10_000).nullable(),
  dependencyIds: z.array(z.uuid()).max(50),
  eventSourceIds: z.array(z.uuid()).max(50),
}).strict().superRefine((value, context) => {
  if (new Set(value.dependencyIds).size !== value.dependencyIds.length) context.addIssue({ code: 'custom', path: ['dependencyIds'], message: 'Duplicate dependencies are not allowed' });
  if (new Set(value.eventSourceIds).size !== value.eventSourceIds.length) context.addIssue({ code: 'custom', path: ['eventSourceIds'], message: 'Duplicate event sources are not allowed' });
});
export type UpdateAssetInput = z.infer<typeof updateAssetBodySchema>;
