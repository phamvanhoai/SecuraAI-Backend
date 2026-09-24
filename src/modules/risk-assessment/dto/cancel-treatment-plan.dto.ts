import { z } from 'zod';

export const cancelTreatmentPlanBodySchema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  reason: z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value.normalize('NFKC').replace(/\s+/gu, ' ').trim()
        : value,
    z.string().min(10).max(1_000),
  ),
});

export type CancelTreatmentPlanBody = z.infer<typeof cancelTreatmentPlanBodySchema>;
