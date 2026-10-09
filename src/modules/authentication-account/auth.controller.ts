import type { RequestHandler } from 'express';
import { authService } from './auth.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { googleLoginBodySchema, loginBodySchema, refreshBodySchema } from './dto/auth.dto.js';
import {
  changePasswordBodySchema,
  confirmPasswordResetBodySchema,
  requestPasswordResetBodySchema,
} from './dto/password.dto.js';

export const login: RequestHandler = async (req, res) => {
  const data = await authService.login(loginBodySchema.parse(req.body));
  res.status(200).json({ success: true, data });
};

export const loginWithGoogle: RequestHandler = async (req, res) => {
  const data = await authService.loginWithGoogle(googleLoginBodySchema.parse(req.body));
  res.status(200).json({ success: true, data });
};

export const refresh: RequestHandler = async (req, res) => {
  const { refreshToken } = refreshBodySchema.parse(req.body);
  const data = await authService.refresh(refreshToken);
  res.status(200).json({ success: true, data });
};

export const logout: RequestHandler = async (req, res) => {
  const { refreshToken } = refreshBodySchema.parse(req.body);
  await authService.logout(refreshToken);
  res.status(204).send();
};

export const requestPasswordReset: RequestHandler = async (req, res) => {
  await authService.requestPasswordReset(requestPasswordResetBodySchema.parse(req.body));
  res.status(202).json({
    success: true,
    data: { message: 'If the account exists, password reset instructions will be sent.' },
  });
};

export const confirmPasswordReset: RequestHandler = async (req, res) => {
  await authService.confirmPasswordReset(confirmPasswordResetBodySchema.parse(req.body));
  res.status(200).json({
    success: true,
    data: { message: 'Password reset successfully. Please log in with your new password.' },
  });
};

export const changePassword: RequestHandler = async (req, res) => {
  const userId: unknown = res.locals.authenticatedUserId;
  if (typeof userId !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  await authService.changePassword(userId, changePasswordBodySchema.parse(req.body));
  res.status(200).json({
    success: true,
    data: { message: 'Password changed successfully. Please log in again.' },
  });
};
