import type { RequestHandler } from 'express';
import { authService } from './auth.service.js';
import type { LoginInput } from './auth.schema.js';

export const login: RequestHandler = async (req, res) => {
  const data = await authService.login(req.body as LoginInput, req);
  res.status(200).json({ success: true, data });
};
export const refresh: RequestHandler = async (req, res) => {
  const data = await authService.refresh((req.body as { refreshToken: string }).refreshToken, req);
  res.status(200).json({ success: true, data });
};
export const logout: RequestHandler = async (req, res) => {
  await authService.logout((req.body as { refreshToken: string }).refreshToken);
  res.status(204).send();
};
