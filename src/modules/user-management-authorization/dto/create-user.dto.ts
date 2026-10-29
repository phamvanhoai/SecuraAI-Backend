import { z } from 'zod';
import { USER_FULL_NAME_MAX_LENGTH } from './user-profile.constants.js';

export const createUserBodySchema = z
  .object({
    email: z
      .email()
      .max(255)
      .transform((value) => value.trim().toLowerCase()),
    fullName: z
      .string()
      .trim()
      .min(2)
      .max(USER_FULL_NAME_MAX_LENGTH, `Full name cannot exceed ${USER_FULL_NAME_MAX_LENGTH} characters`)
      .regex(/^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u),
    phone: z.string().regex(/^\d{10}$/).optional(),
    employeeCode: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/).optional(),
    departmentId: z.uuid().optional(),
    role: z.enum(['SECURITY_OFFICER', 'EMPLOYEE', 'EXECUTIVE']),
  })
  .strict();

export type CreateUserBody = z.infer<typeof createUserBodySchema>;
