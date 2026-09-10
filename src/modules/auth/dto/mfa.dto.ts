import { z } from 'zod';

export const setupMfaBodySchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
});

export const verifyMfaBodySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'MFA code must be a 6-digit code'),
});

export type SetupMfaBody = z.infer<typeof setupMfaBodySchema>;
export type VerifyMfaBody = z.infer<typeof verifyMfaBodySchema>;