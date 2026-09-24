import { z } from 'zod';

export const listPolicyDepartmentAssignmentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const assignPolicyDepartmentsParamsSchema = z.object({ policyId: z.uuid() }).strict();

export const assignPolicyDepartmentsBodySchema = z
  .object({ departmentIds: z.array(z.uuid()).max(200) })
  .strict()
  .transform((value) => ({ departmentIds: [...new Set(value.departmentIds)] }));

export type ListPolicyDepartmentAssignmentsQuery = z.infer<
  typeof listPolicyDepartmentAssignmentsQuerySchema
>;
export type AssignPolicyDepartmentsInput = z.infer<typeof assignPolicyDepartmentsBodySchema>;
