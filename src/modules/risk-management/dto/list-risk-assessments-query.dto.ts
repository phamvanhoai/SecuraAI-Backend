import { z } from 'zod';

export const riskLevels = ['low', 'medium', 'high', 'critical'] as const;
export const riskAssessmentStatuses = [
  'draft',
  'pending_approval',
  'approved',
  'in_treatment',
  'closed',
  'rejected',
  'cancelled',
] as const;
export const riskListSortFields = [
  'riskCode',
  'title',
  'riskScore',
  'riskLevel',
  'assessedAt',
  'updatedAt',
] as const;

export const listRiskAssessmentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    q: z.string().trim().min(1).max(100).optional(),
    riskLevel: z.enum(riskLevels).optional(),
    status: z.enum(riskAssessmentStatuses).optional(),
    targetType: z.enum(['asset', 'business_process']).optional(),
    assessedFrom: z.iso.date().optional(),
    assessedTo: z.iso.date().optional(),
    hasTreatmentPlan: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    sortBy: z.enum(riskListSortFields).default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine(
    ({ assessedFrom, assessedTo }) => !assessedFrom || !assessedTo || assessedFrom <= assessedTo,
    {
      message: 'assessedFrom must be on or before assessedTo',
      path: ['assessedTo'],
    },
  );

export type ListRiskAssessmentsQuery = z.infer<typeof listRiskAssessmentsQuerySchema>;
