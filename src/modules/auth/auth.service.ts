import argon2 from 'argon2';
import type { Request } from 'express';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { createRefreshToken, hashToken, signAccessToken } from '../../common/utils/tokens.js';
import type { LoginInput } from './auth.schema.js';

const authUserInclude = {
  user_roles_user_roles_user_idTousers: {
    include: {
      roles: {
        include: { role_permissions: { include: { permissions: true } } },
      },
    },
  },
} as const;

const getAccessClaims = (user: Awaited<ReturnType<typeof findAuthUser>>) => {
  if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  return {
    userId: user.user_id,
    roles: user.user_roles_user_roles_user_idTousers.map(({ roles }) => roles.code),
    permissions: [
      ...new Set(
        user.user_roles_user_roles_user_idTousers.flatMap(({ roles }) =>
          roles.role_permissions.map(({ permissions }) => permissions.code),
        ),
      ),
    ],
  };
};

const findAuthUser = (email: string) =>
  prisma.users.findUnique({ where: { email }, include: authUserInclude });

const sessionMetadata = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
});

export const authService = {
  async login(input: LoginInput, req: Request) {
    const user = await findAuthUser(input.email);
    const valid = user ? await argon2.verify(user.password_hash, input.password) : false;
    if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    if (user.status !== 'active' || user.deleted_at)
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');

    const claims = getAccessClaims(user);
    const refreshToken = createRefreshToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await prisma.$transaction([
      prisma.auth_sessions.create({
        data: {
          user_id: user.user_id,
          refresh_token_hash: hashToken(refreshToken),
          expires_at: expiresAt,
          ip_address: sessionMetadata(req).ipAddress,
          user_agent: sessionMetadata(req).userAgent,
        },
      }),
      prisma.users.update({
        where: { user_id: user.user_id },
        data: { last_login_at: new Date() },
      }),
    ]);
    return { accessToken: signAccessToken(claims), refreshToken, expiresIn: env.JWT_ACCESS_EXPIRES_IN };
  },

  async refresh(refreshToken: string, req: Request) {
    const session = await prisma.auth_sessions.findFirst({
      where: { refresh_token_hash: hashToken(refreshToken) },
      include: { users: { include: authUserInclude } },
    });
    if (!session || session.revoked_at || session.expires_at <= new Date()) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }
    if (session.users.status !== 'active' || session.users.deleted_at)
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');

    const nextToken = createRefreshToken();
    await prisma.$transaction([
      prisma.auth_sessions.update({
        where: { auth_session_id: session.auth_session_id },
        data: { revoked_at: new Date() },
      }),
      prisma.auth_sessions.create({
        data: {
          user_id: session.user_id,
          refresh_token_hash: hashToken(nextToken),
          expires_at: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
          ip_address: sessionMetadata(req).ipAddress,
          user_agent: sessionMetadata(req).userAgent,
        },
      }),
    ]);
    return {
      accessToken: signAccessToken(getAccessClaims(session.users)),
      refreshToken: nextToken,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    };
  },

  async logout(refreshToken: string): Promise<void> {
    await prisma.auth_sessions.updateMany({
      where: { refresh_token_hash: hashToken(refreshToken), revoked_at: null },
      data: { revoked_at: new Date() },
    });
  },
};
