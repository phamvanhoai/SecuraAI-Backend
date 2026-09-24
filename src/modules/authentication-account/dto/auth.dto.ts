import { z } from 'zod';

export const loginBodySchema = z.strictObject({
  email: z.email().max(255).transform((email) => email.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

export const refreshBodySchema = z.strictObject({
  refreshToken: z.string().min(32).max(256),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
