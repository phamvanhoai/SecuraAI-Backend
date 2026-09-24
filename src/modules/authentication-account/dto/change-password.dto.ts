import { z } from 'zod';
import { passwordSchema } from '../auth.schema.js';

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;