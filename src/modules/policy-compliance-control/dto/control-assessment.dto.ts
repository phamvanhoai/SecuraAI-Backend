import { z } from 'zod';

export const complianceStatuses = [
  'compliant',
  'partially_compliant',
  'non_compliant',
  'not_assessed',
] as const;

export const listControlAssessmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  frameworkId: z.string().uuid().optional(),
  status: z.enum(complianceStatuses).optional(),
  reviewState: z.enum(['overdue', 'due_soon', 'scheduled', 'unscheduled']).optional(),
});

export const controlAssessmentParamsSchema = z.object({
  controlId: z.string().uuid(),
});

export const createControlAssessmentBodySchema = z.object({
  complianceStatus: z.enum(complianceStatuses),
  score: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  nextReviewAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type ListControlAssessmentsQuery = z.infer<typeof listControlAssessmentsQuerySchema>;
export type CreateControlAssessmentInput = z.infer<typeof createControlAssessmentBodySchema>;
