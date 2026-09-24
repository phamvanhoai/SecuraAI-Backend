import { z } from 'zod';

export const treatmentPlanStrategies = ['avoid', 'mitigate', 'transfer', 'accept'] as const;
export const treatmentPlanStatuses = [
  'draft',
  'pending_approval',
  'approved',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
] as const;
export const treatmentPlanSortFields = [
  'riskCode',
  'strategy',
  'status',
  'targetDate',
  'createdAt',
  'updatedAt',
] as const;

export const listTreatmentPlansQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    q: z.string().trim().min(1).max(100).optional(),
    status: z.enum(treatmentPlanStatuses).optional(),
    strategy: z.enum(treatmentPlanStrategies).optional(),
    ownerId: z.uuid().optional(),
    targetFrom: z.iso.date().optional(),
    targetTo: z.iso.date().optional(),
    overdue: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    sortBy: z.enum(treatmentPlanSortFields).default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine(({ targetFrom, targetTo }) => !targetFrom || !targetTo || targetFrom <= targetTo, {
    message: 'targetFrom must be on or before targetTo',
    path: ['targetTo'],
  });

export type ListTreatmentPlansQuery = z.infer<typeof listTreatmentPlansQuerySchema>;
