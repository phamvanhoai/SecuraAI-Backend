import { z } from 'zod';

export const requestPasswordResetBodySchema = z.object({
  email: z.email().max(255).transform((value) => value.toLowerCase().trim()),
});

export const confirmPasswordResetBodySchema = z.object({
  token: z.string().regex(/^\d{6}$/, 'Reset token must be a 6-digit code'),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((input) => input.newPassword === input.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type RequestPasswordResetBody = z.infer<typeof requestPasswordResetBodySchema>;
export type ConfirmPasswordResetBody = z.infer<typeof confirmPasswordResetBodySchema>;