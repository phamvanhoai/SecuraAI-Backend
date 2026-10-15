import { z } from 'zod';
export const listControlEffectivenessQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).default(''),
});
export const controlEffectivenessParamsSchema = z.object({ controlId: z.uuid() });
export const assessControlEffectivenessBodySchema = z
  .object({
    testMethod: z.string().trim().min(3).max(1000),
    result: z.enum(['effective', 'partially_effective', 'ineffective']),
    effectiveness: z.coerce.number().min(0).max(100),
    notes: z.string().trim().min(10).max(5000),
  })
  .strict();
export type ListControlEffectivenessQuery = z.infer<typeof listControlEffectivenessQuerySchema>;
export type AssessControlEffectivenessBody = z.infer<typeof assessControlEffectivenessBodySchema>;
