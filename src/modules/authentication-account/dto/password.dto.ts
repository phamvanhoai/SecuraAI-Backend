import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const requestPasswordResetBodySchema = z.strictObject({
  email: z
    .email()
    .max(255)
    .transform((value) => value.trim().toLowerCase()),
});

export const confirmPasswordResetBodySchema = z
  .strictObject({
    token: z.string().regex(/^\d{6}$/, 'Reset token must be a 6-digit code'),
    newPassword: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordBodySchema = z
  .strictObject({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RequestPasswordResetBody = z.infer<typeof requestPasswordResetBodySchema>;
export type ConfirmPasswordResetBody = z.infer<typeof confirmPasswordResetBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
