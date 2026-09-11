import { z } from 'zod';

export const createUserBodySchema = z.object({
  email: z.email().max(255).transform((value) => value.toLowerCase().trim()),
  fullName: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(3).max(30).optional(),
  employeeCode: z.string().trim().min(1).max(50).optional(),
  departmentId: z.uuid().optional(),
  roleCodes: z.array(z.string().trim().min(1).max(50)).min(1).max(10),
});

export type CreateUserBody = z.infer<typeof createUserBodySchema>;