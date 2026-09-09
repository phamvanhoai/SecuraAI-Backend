import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const createRefreshToken = (): string => randomBytes(48).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const signAccessToken = (payload: {
  userId: string;
  roles: string[];
  permissions: string[];
}): string =>
  jwt.sign(
    { type: 'access', roles: payload.roles, permissions: payload.permissions },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      subject: payload.userId,
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as NonNullable<jwt.SignOptions['expiresIn']>,
    },
  );
