import { z } from 'zod';

export const updateUserBodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(255).regex(/^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u),
    phone: z.string().regex(/^\d{10}$/).nullable(),
    employeeCode: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/).nullable(),
    departmentId: z.uuid().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']),
  })
  .strict();

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
