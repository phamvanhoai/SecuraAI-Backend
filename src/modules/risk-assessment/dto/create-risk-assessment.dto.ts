import { z } from 'zod';

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );
const linkedThreat = z.object({ threatId: z.uuid(), notes: optionalText(1_000) }).strict();
const linkedVulnerability = z
  .object({ vulnerabilityId: z.uuid(), notes: optionalText(1_000) })
  .strict();

export const createRiskAssessmentBodySchema = z
  .object({
    assetId: z.uuid().optional(),
    businessProcessId: z.uuid().optional(),
    title: z
      .string()
      .trim()
      .min(3)
      .max(255)
      .transform((value) => value.normalize('NFKC').replace(/\s+/gu, ' ')),
    description: optionalText(5_000),
    likelihood: z.number().int().min(1).max(5),
    impact: z.number().int().min(1).max(5),
    threats: z.array(linkedThreat).min(1).max(50),
    vulnerabilities: z.array(linkedVulnerability).min(1).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (Number(value.assetId !== undefined) + Number(value.businessProcessId !== undefined) !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['assetId'],
        message: 'Select exactly one assessment target',
      });
    }
    if (new Set(value.threats.map(({ threatId }) => threatId)).size !== value.threats.length) {
      context.addIssue({
        code: 'custom',
        path: ['threats'],
        message: 'Threats must not contain duplicates',
      });
    }
    if (
      new Set(value.vulnerabilities.map(({ vulnerabilityId }) => vulnerabilityId)).size !==
      value.vulnerabilities.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['vulnerabilities'],
        message: 'Vulnerabilities must not contain duplicates',
      });
    }
  });

export type CreateRiskAssessmentBody = z.infer<typeof createRiskAssessmentBodySchema>;
