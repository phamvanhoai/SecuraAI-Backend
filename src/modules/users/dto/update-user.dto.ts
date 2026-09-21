import { z } from 'zod';

export const updateUserBodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(150).optional(),
    phone: z.string().trim().min(3).max(30).nullable().optional(),
    employeeCode: z.string().trim().min(1).max(50).nullable().optional(),
    departmentId: z.uuid().nullable().optional(),
    roleCodes: z
      .array(z.string().trim().min(1).max(50))
      .min(1)
      .max(10)
      .refine((codes) => new Set(codes).size === codes.length, 'Role codes must be unique')
      .optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'At least one field must be provided');

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
