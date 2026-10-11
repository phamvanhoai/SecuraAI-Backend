import { z } from 'zod';
export const listAssetsQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(10), q: z.string().trim().min(1).max(100).optional(), assetType: z.string().trim().min(1).max(100).optional(), criticality: z.enum(['low', 'medium', 'high', 'critical']).optional(), status: z.enum(['active', 'archived']).optional(), ownerUserId: z.uuid().optional(), businessServiceId: z.uuid().optional(), sortBy: z.enum(['assetCode', 'name', 'assetType', 'criticality', 'createdAt', 'updatedAt']).default('assetCode'), sortOrder: z.enum(['asc', 'desc']).default('asc') }).strict();
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
export const assetIdParamsSchema = z.object({ assetId: z.uuid() });
