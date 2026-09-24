import { z } from 'zod';

export const updateTreatmentActionProgressBodySchema = z.strictObject({
  expectedUpdatedAt: z.union([z.iso.datetime({ offset: true }), z.date()]).pipe(z.coerce.date()),
  progressPercent: z.number().int().min(0).max(100),
  progressNote: z.string().trim().min(10).max(1000).optional(),
});

export const treatmentActionProgressParamsSchema = z.object({
  treatmentPlanId: z.string().uuid(),
  actionId: z.string().uuid(),
});

export type UpdateTreatmentActionProgressBody = z.infer<
  typeof updateTreatmentActionProgressBodySchema
>;
