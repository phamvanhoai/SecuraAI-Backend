import { z } from 'zod';

export const assetCriticalities = ['low', 'medium', 'high', 'critical'] as const;
export const assetStatuses = ['active', 'inactive', 'retired', 'disposed'] as const;
export const assetListSortFields = ['assetCode', 'name', 'createdAt', 'updatedAt'] as const;

export const listAssetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  assetType: z.string().trim().min(1).max(50).optional(),
  criticality: z.enum(assetCriticalities).optional(),
  status: z.enum(assetStatuses).optional(),
  departmentId: z.uuid().optional(),
  ownerUserId: z.uuid().optional(),
  sortBy: z.enum(assetListSortFields).default('assetCode'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
