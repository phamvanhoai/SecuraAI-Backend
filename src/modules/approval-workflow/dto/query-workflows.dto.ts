import { z } from 'zod';
import { WORKFLOW_ENTITY_TYPES } from '../approval-workflow.constants.js';

const emptyOrAllToUndefined = (val: unknown): unknown => {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'all') return undefined;
    return trimmed;
  }
  return val;
};

const preprocessBoolean = (val: unknown): unknown => {
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    if (trimmed === 'true' || trimmed === '1') return true;
    if (trimmed === 'false' || trimmed === '0') return false;
    if (trimmed === '' || trimmed === 'all') return undefined;
  }
  if (typeof val === 'boolean') return val;
  return undefined;
};

export const queryWorkflowDefinitionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.preprocess(emptyOrAllToUndefined, z.string().trim().min(1).optional()),
  entityType: z.preprocess(emptyOrAllToUndefined, z.enum(WORKFLOW_ENTITY_TYPES).optional()),
  isActive: z.preprocess(preprocessBoolean, z.boolean().optional()),
  sortBy: z.enum(['name', 'entityType', 'createdAt', 'updatedAt', 'isActive']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryWorkflowDefinitionsDto = z.infer<typeof queryWorkflowDefinitionsSchema>;
