import type { RequestHandler } from 'express';
import { authService } from './auth.service.js';
import { loginBodySchema, refreshBodySchema } from './dto/auth.dto.js';

export const login: RequestHandler = async (req, res) => {
  const data = await authService.login(loginBodySchema.parse(req.body));
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
