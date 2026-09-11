import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const loginSchema = z.object({
  email: z.email().max(255).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(32).max(256) });
export type LoginInput = z.infer<typeof loginSchema>;
