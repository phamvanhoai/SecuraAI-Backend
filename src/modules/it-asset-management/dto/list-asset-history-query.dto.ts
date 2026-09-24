import { z } from 'zod';

export const assetHistoryActions = [
  'created',
  'imported',
  'updated',
  'classified',
  'owner_assigned',
  'owner_reassigned',
  'owner_unassigned',
  'deleted',
] as const;

export const listAssetHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    action: z.enum(assetHistoryActions).optional(),
    changedByUserId: z.uuid().optional(),
    from: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    to: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'from must be earlier than or equal to to',
    path: ['from'],
  });

export type ListAssetHistoryQuery = ReturnType<typeof listAssetHistoryQuerySchema.parse>;
