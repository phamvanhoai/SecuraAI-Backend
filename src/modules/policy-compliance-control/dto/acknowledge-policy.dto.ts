import { z } from 'zod';
export const employeePolicyQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['all', 'pending', 'acknowledged']).default('all'),
  })
  .strict();
export const policyAcknowledgementParamsSchema = z
  .object({ policyId: z.uuid(), versionId: z.uuid() })
  .strict();
export type EmployeePolicyQuery = z.infer<typeof employeePolicyQuerySchema>;
