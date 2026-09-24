import { z } from 'zod';
import { integrationTypeEnum } from './create-integration.dto.js';

export const integrationStatusEnum = z.enum(['active', 'inactive', 'error', 'disabled']);

const emptyOrAllToUndefined = (val: unknown) => {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'all') return undefined;
    return trimmed;
  }
  return val;
};

export const queryIntegrationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.preprocess(emptyOrAllToUndefined, integrationTypeEnum.optional()),
  status: z.preprocess(emptyOrAllToUndefined, integrationStatusEnum.optional()),
  search: z.preprocess(emptyOrAllToUndefined, z.string().trim().optional()),
  sortBy: z.enum(['createdAt', 'name', 'lastConnectedAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryIntegrationsDto = z.infer<typeof queryIntegrationsSchema>;
