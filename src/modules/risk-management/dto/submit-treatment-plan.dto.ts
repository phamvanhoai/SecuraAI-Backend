import { z } from 'zod';

export const treatmentPlanParamsSchema = z.strictObject({
  treatmentPlanId: z.uuid(),
});

const optionalSubmissionNote = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value.normalize('NFKC').replace(/\s+/gu, ' ').trim() || undefined
      : value,
  z.string().max(1_000).optional(),
);

export const submitTreatmentPlanBodySchema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  submissionNote: optionalSubmissionNote,
});

export type SubmitTreatmentPlanBody = z.infer<typeof submitTreatmentPlanBodySchema>;
