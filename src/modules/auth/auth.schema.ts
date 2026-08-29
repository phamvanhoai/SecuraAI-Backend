import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email().max(255).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(32).max(256) });
export type LoginInput = z.infer<typeof loginSchema>;
