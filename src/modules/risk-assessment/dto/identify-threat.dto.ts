import { z } from 'zod';

export const identifyThreatParamsSchema = z.object({ riskId: z.uuid() });
export const updateThreatParamsSchema = z.object({
  riskId: z.uuid(),
  threatId: z.uuid(),
});
export const identifyThreatBodySchema = z
  .object({
    name: z.string().trim().min(2).max(255),
    description: z.string().trim().min(3).max(3000),
    vulnerabilityIds: z.array(z.uuid()).min(1).max(50),
  })
  .strict()
  .refine((value) => new Set(value.vulnerabilityIds).size === value.vulnerabilityIds.length, {
    path: ['vulnerabilityIds'],
    message: 'Vulnerability IDs must be unique',
  });
export type IdentifyThreatBody = z.infer<typeof identifyThreatBodySchema>;
export const updateThreatBodySchema = identifyThreatBodySchema.extend({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});
export type UpdateThreatBody = z.infer<typeof updateThreatBodySchema>;
