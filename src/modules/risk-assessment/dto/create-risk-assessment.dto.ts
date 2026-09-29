import { z } from 'zod';

const namedItemSchema = z.object({
  name: z.string().trim().min(2).max(255),
  description: z.string().trim().max(2000).optional(),
});

const scoreSchema = z.coerce.number().int().min(1).max(5);

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
    threats: z.array(namedItemSchema).min(1).max(20),
    vulnerabilities: z.array(namedItemSchema).min(1).max(20),
    inherentLikelihood: scoreSchema,
    inherentImpact: scoreSchema,
    controlEffectiveness: z.coerce.number().min(0).max(100),
    residualLikelihood: scoreSchema,
    residualImpact: scoreSchema,
    targetRisk: z.enum(['low', 'medium', 'high', 'critical']),
    riskAppetite: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    riskTolerance: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    assessmentReason: z.string().trim().min(3).max(3000),
  })
  .superRefine((value, context) => {
    for (const [field, items] of [
      ['threats', value.threats],
      ['vulnerabilities', value.vulnerabilities],
    ] as const) {
      const names = new Set<string>();
      items.forEach((item, index) => {
        const normalized = item.name.toLocaleLowerCase();
        if (names.has(normalized))
          context.addIssue({ code: 'custom', path: [field, index, 'name'], message: 'Names must be unique' });
        names.add(normalized);
      });
    }
  });

export const createRiskOptionsQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateRiskAssessmentBody = z.infer<typeof createRiskAssessmentBodySchema>;
export type CreateRiskOptionsQuery = z.infer<typeof createRiskOptionsQuerySchema>;
