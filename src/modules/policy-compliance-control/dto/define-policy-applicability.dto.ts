import { z } from 'zod';

export const policyApplicabilityParamsSchema = z.object({
  policyId: z.uuid(),
  versionId: z.uuid(),
});

export const definePolicyApplicabilityBodySchema = z
  .object({
    departmentIds: z
      .array(z.uuid())
      .max(200)
      .default([])
      .transform((values) => [...new Set(values)]),
    roleCodes: z
      .array(z.enum(['ADMIN', 'SECURITY_OFFICER', 'EXECUTIVE', 'EMPLOYEE']))
      .max(4)
      .default([])
      .transform((values) => [...new Set(values)]),
    userGroups: z
      .array(z.string().trim().min(1).max(100))
      .max(200)
      .default([])
      .transform((values) => [...new Set(values)]),
    organizationalScope: z.string().trim().max(2000).nullable().default(null),
    rationale: z.string().trim().min(20).max(2000),
    referenceBasis: z.string().trim().min(5).max(2000),
  })
  .refine(
    (value) =>
      value.departmentIds.length > 0 ||
      value.roleCodes.length > 0 ||
      value.userGroups.length > 0 ||
      Boolean(value.organizationalScope),
    {
      message: 'Select or describe at least one applicability scope',
      path: ['organizationalScope'],
    },
  );

export type DefinePolicyApplicabilityBody = z.infer<typeof definePolicyApplicabilityBodySchema>;
