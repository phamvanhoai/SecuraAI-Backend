import { z } from 'zod';

export const createRiskAssessmentBodySchema = z
  .object({
    title: z.string().trim().min(3).max(255),
    description: z.string().trim().min(3).max(5000),
    ownerUserId: z.uuid(),
    reviewDate: z.iso.date(),
    scope: z.discriminatedUnion('type', [
      z.object({ type: z.literal('asset'), assetId: z.uuid() }),
      z.object({ type: z.literal('business_service'), businessServiceId: z.uuid() }),
    ]),
  })
  .strict();

export const createRiskOptionsQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateRiskAssessmentBody = z.infer<typeof createRiskAssessmentBodySchema>;
export type CreateRiskOptionsQuery = z.infer<typeof createRiskOptionsQuerySchema>;
