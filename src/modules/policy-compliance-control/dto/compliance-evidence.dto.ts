import { z } from 'zod';

export const evidenceParamsSchema = z.object({ evidenceId: z.string().uuid() });
export const assessmentEvidenceParamsSchema = z.object({ assessmentId: z.string().uuid() });
export const listEvidenceAssessmentsQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20), q: z.string().trim().max(100).optional() });
export const uploadEvidenceBodySchema = z.object({
  description: z.string().trim().max(2000).optional().transform((value) => value || null),
  validUntil: z.string().trim().optional().transform((value) => value || null).pipe(z.iso.date().nullable()),
}).superRefine((value, context) => {
  if (value.validUntil && value.validUntil < new Date().toISOString().slice(0, 10)) context.addIssue({ code: 'custom', path: ['validUntil'], message: 'Evidence validity cannot end in the past' });
});
export type ListEvidenceAssessmentsQuery = z.infer<typeof listEvidenceAssessmentsQuerySchema>;
export type UploadEvidenceInput = z.infer<typeof uploadEvidenceBodySchema>;
