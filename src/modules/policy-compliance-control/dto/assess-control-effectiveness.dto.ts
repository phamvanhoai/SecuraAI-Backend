import { z } from 'zod';
// Check list pagination and search values from the URL query.
export const listControlEffectivenessQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).default(''),
});
// The Control ID in the URL must be a valid UUID.
export const controlEffectivenessParamsSchema = z.object({ controlId: z.uuid() });
// Accept only the supported implementation status values.
const implementationStatus = z.enum([
  'not_implemented',
  'planned',
  'partially_implemented',
  'implemented',
]);
// Internal score bands: below 50 Ineffective, 50 to below 80 Partially effective, 80 to 100 Effective.
export function resultForEffectiveness(
  score: number,
): 'effective' | 'partially_effective' | 'ineffective' {
  return score >= 80 ? 'effective' : score >= 50 ? 'partially_effective' : 'ineffective';
}
// Check the assessment form before the controller calls the service.
export const assessControlEffectivenessBodySchema = z
  .object({
    // Require 1 to 100 Evidence IDs with no duplicates. The repository checks links and validity.
    evidenceIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Select each evidence only once'),
    // Describe how the Control was tested using 3 to 1,000 characters.
    testMethod: z.string().trim().min(3).max(1000),
    // The selected result must also match the effectiveness score below.
    result: z.enum(['effective', 'partially_effective', 'ineffective']),
    // Allow a score from 0 to 100 in steps of 0.01; convert numeric input to a number.
    effectiveness: z.coerce.number().min(0).max(100).multipleOf(0.01),
    // Require assessment notes of 10 to 5,000 characters.
    notes: z.string().trim().min(10).max(5000),
    // Optional status selected by the user for this assessment.
    implementationStatus: implementationStatus.optional(),
    // Original form status, used to detect a conflicting update before saving.
    expectedImplementationStatus: implementationStatus.optional(),
    // When supplied, the reason must have 10 to 2,000 characters.
    implementationChangeReason: z.string().trim().min(10).max(2000).optional(),
  })
  // Reject fields that are not defined in this schema.
  .strict()
  // Check rules that depend on more than one form field.
  .superRefine((value, context) => {
    // Reject a result that does not match its score, such as Effective with 60%.
    if (value.result !== resultForEffectiveness(value.effectiveness))
      context.addIssue({
        code: 'custom',
        path: ['result'],
        message:
          'Result must match effectiveness: below 50% Ineffective, below 80% Partially effective, otherwise Effective.',
      });
    // Send both the selected status and original status, or leave both out.
    if (
      (value.implementationStatus === undefined) !==
      (value.expectedImplementationStatus === undefined)
    )
      context.addIssue({
        code: 'custom',
        path: ['implementationStatus'],
        message: 'Provide both the current baseline and selected implementation status',
      });
    // Explain why the implementation status is changing.
    if (
      value.implementationStatus !== value.expectedImplementationStatus &&
      !value.implementationChangeReason
    )
      context.addIssue({
        code: 'custom',
        path: ['implementationChangeReason'],
        message: 'Explain the implementation change in at least 10 characters',
      });
  });
// Use the validated schema shapes as TypeScript input types.
export type ListControlEffectivenessQuery = z.infer<typeof listControlEffectivenessQuerySchema>;
export type AssessControlEffectivenessBody = z.infer<typeof assessControlEffectivenessBodySchema>;
