import { z } from 'zod';

const optionalNullableText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );
const threat = z.object({ threatId: z.uuid(), notes: optionalNullableText(1_000) }).strict();
const vulnerability = z
  .object({ vulnerabilityId: z.uuid(), notes: optionalNullableText(1_000) })
  .strict();

export const updateRiskAssessmentBodySchema = z
  .object({
    assetId: z.uuid().optional(),
    businessProcessId: z.uuid().optional(),
    title: z
      .string()
      .trim()
      .min(3)
      .max(255)
      .transform((value) => value.normalize('NFKC').replace(/\s+/gu, ' ')),
    description: optionalNullableText(5_000),
    likelihood: z.number().int().min(1).max(5),
    impact: z.number().int().min(1).max(5),
    threats: z.array(threat).min(1).max(50),
    vulnerabilities: z.array(vulnerability).min(1).max(50),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (Number(value.assetId !== undefined) + Number(value.businessProcessId !== undefined) !== 1)
      context.addIssue({
        code: 'custom',
        path: ['assetId'],
        message: 'Select exactly one assessment target',
      });
    if (new Set(value.threats.map(({ threatId }) => threatId)).size !== value.threats.length)
      context.addIssue({
        code: 'custom',
        path: ['threats'],
        message: 'Threats must not contain duplicates',
      });
    if (
      new Set(value.vulnerabilities.map(({ vulnerabilityId }) => vulnerabilityId)).size !==
      value.vulnerabilities.length
    )
      context.addIssue({
        code: 'custom',
        path: ['vulnerabilities'],
        message: 'Vulnerabilities must not contain duplicates',
      });
  });

export type UpdateRiskAssessmentBody = z.infer<typeof updateRiskAssessmentBodySchema>;
