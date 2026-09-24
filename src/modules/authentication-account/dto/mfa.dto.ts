import { z } from 'zod';

export const setupMfaBodySchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
});

export const verifyMfaBodySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'MFA code must be a 6-digit code'),
});

export const verifyMfaChallengeBodySchema = z.object({
  challengeToken: z.string().min(32).max(256),
  code: z.string().regex(/^(?:\d{6}|[A-Za-z0-9]{4}(?:-[A-Za-z0-9]{4}){2})$/, 'Code must be a 6-digit authenticator code or recovery code'),
}).strict();

export const disableMfaBodySchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  code: z.string().regex(/^\d{6}$/, 'MFA code must be a 6-digit code'),
}).strict();

export type SetupMfaBody = z.infer<typeof setupMfaBodySchema>;
export type VerifyMfaBody = z.infer<typeof verifyMfaBodySchema>;
export type VerifyMfaChallengeBody = z.infer<typeof verifyMfaChallengeBodySchema>;
export type DisableMfaBody = z.infer<typeof disableMfaBodySchema>;
