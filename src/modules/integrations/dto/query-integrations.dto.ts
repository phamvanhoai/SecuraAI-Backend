import { z } from 'zod';
import { integrationTypeEnum } from './create-integration.dto.js';

export const integrationStatusEnum = z.enum(['active', 'inactive', 'error', 'disabled']);

export const queryIntegrationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: integrationTypeEnum.optional(),
  status: integrationStatusEnum.optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(['createdAt', 'name', 'lastConnectedAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryIntegrationsDto = z.infer<typeof queryIntegrationsSchema>;
