import { z } from 'zod';
export const listControlEffectivenessQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).default(''),
});
export const controlEffectivenessParamsSchema = z.object({ controlId: z.uuid() });
const implementationStatus = z.enum([
  'not_implemented',
  'planned',
  'partially_implemented',
  'implemented',
]);
export function resultForEffectiveness(
  score: number,
): 'effective' | 'partially_effective' | 'ineffective' {
  return score >= 80 ? 'effective' : score >= 50 ? 'partially_effective' : 'ineffective';
}
export const assessControlEffectivenessBodySchema = z
  .object({
    testMethod: z.string().trim().min(3).max(1000),
    result: z.enum(['effective', 'partially_effective', 'ineffective']),
    effectiveness: z.coerce.number().min(0).max(100).multipleOf(0.01),
    notes: z.string().trim().min(10).max(5000),
    implementationStatus: implementationStatus.optional(),
    expectedImplementationStatus: implementationStatus.optional(),
    implementationChangeReason: z.string().trim().min(10).max(2000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.result !== resultForEffectiveness(value.effectiveness))
      context.addIssue({
        code: 'custom',
        path: ['result'],
        message:
          'Result must match effectiveness: below 50% Ineffective, below 80% Partially effective, otherwise Effective.',
      });
    if (
      (value.implementationStatus === undefined) !==
      (value.expectedImplementationStatus === undefined)
    )
      context.addIssue({
        code: 'custom',
        path: ['implementationStatus'],
        message: 'Provide both the current baseline and selected implementation status',
      });
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
export type ListControlEffectivenessQuery = z.infer<typeof listControlEffectivenessQuerySchema>;
export type AssessControlEffectivenessBody = z.infer<typeof assessControlEffectivenessBodySchema>;
