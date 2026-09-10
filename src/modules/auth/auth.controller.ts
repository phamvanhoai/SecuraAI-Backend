import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { authService } from './auth.service.js';
import {
  confirmPasswordResetBodySchema,
  requestPasswordResetBodySchema,
} from './dto/password-reset.dto.js';
import { changePasswordBodySchema } from './dto/change-password.dto.js';
import { setupMfaBodySchema, verifyMfaBodySchema } from './dto/mfa.dto.js';
import type { LoginInput } from './auth.schema.js';

export const requestPasswordReset: RequestHandler = async (req, res) => {
  await authService.requestPasswordReset(requestPasswordResetBodySchema.parse(req.body));
  res.status(202).json({
    success: true,
    data: {
      message: 'If the account exists, password reset instructions will be sent.',
    },
  });
};

export const confirmPasswordReset: RequestHandler = async (req, res) => {
  await authService.confirmPasswordReset(confirmPasswordResetBodySchema.parse(req.body));
  res.status(200).json({
    success: true,
    data: { message: 'Password reset successfully. Please log in with your new password.' },
  });
};

export const login: RequestHandler = async (req, res) => {
  const data = await authService.login(req.body as LoginInput, req);
  res.status(200).json({ success: true, data });
};
export const changePassword: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  await authService.changePassword(req.auth.userId, changePasswordBodySchema.parse(req.body));
  res.status(200).json({
    success: true,
    data: { message: 'Password changed successfully. Please log in again.' },
  });
};
export const setupMfa: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await authService.setupMfa(req.auth.userId, setupMfaBodySchema.parse(req.body));
  res.status(200).json({ success: true, data });
};
export const verifyMfa: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  await authService.verifyMfa(req.auth.userId, verifyMfaBodySchema.parse(req.body));
  res.status(200).json({
    success: true,
    data: { message: 'MFA enabled successfully. Future logins require an authenticator code.' },
  });
};
export const refresh: RequestHandler = async (req, res) => {
  const data = await authService.refresh((req.body as { refreshToken: string }).refreshToken, req);
  res.status(200).json({ success: true, data });
};
export const logout: RequestHandler = async (req, res) => {
  await authService.logout((req.body as { refreshToken: string }).refreshToken);
  res.status(204).send();
};
