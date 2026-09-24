import { z } from 'zod';

export const assignUserRolesBodySchema = z.object({
  roleCodes: z.array(z.string().trim().min(1).max(50)).min(1).max(10)
    .refine((codes) => new Set(codes).size === codes.length, 'Role codes must be unique'),
}).strict();

export type AssignUserRolesBody = z.infer<typeof assignUserRolesBodySchema>;
