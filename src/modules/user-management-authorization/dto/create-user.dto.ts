import { z } from 'zod';

export const createUserBodySchema = z
  .object({
    email: z
      .email()
      .max(255)
      .transform((value) => value.trim().toLowerCase()),
    fullName: z.string().trim().min(2).max(255),
    role: z.enum(['SECURITY_OFFICER', 'EMPLOYEE', 'EXECUTIVE']),
  })
  .strict();

export type CreateUserBody = z.infer<typeof createUserBodySchema>;


