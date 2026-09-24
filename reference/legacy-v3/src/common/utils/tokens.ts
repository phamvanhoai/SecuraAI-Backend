import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const createRefreshToken = (): string => randomBytes(48).toString('base64url');
export const createMfaChallengeToken = (): string => randomBytes(32).toString('base64url');
export const createMfaRecoveryCodes = (): string[] =>
  Array.from({ length: 10 }, () =>
    randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g)?.join('-'),
  ).filter((code): code is string => code !== undefined);
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const signAccessToken = (payload: {
  userId: string;
  roles: string[];
  permissions: string[];
  accountLockVersion?: string;
}): string =>
  jwt.sign(
    {
      type: 'access',
      roles: payload.roles,
      permissions: payload.permissions,
      ...(payload.accountLockVersion !== undefined
        ? { accountLockVersion: payload.accountLockVersion }
        : {}),
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      subject: payload.userId,
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as NonNullable<jwt.SignOptions['expiresIn']>,
    },
  );
