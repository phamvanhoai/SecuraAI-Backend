import argon2 from 'argon2';
import type { Request } from 'express';
import { prisma } from '@/database/prisma.js';
import { env } from '@/config/env.js';
import { AppError } from '@/common/errors/app-error.js';
import { createRefreshToken, hashToken, signAccessToken } from '@/common/utils/tokens.js';
import type { LoginInput } from './auth.schema.js';

const authUserInclude = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} as const;

const getAccessClaims = (user: Awaited<ReturnType<typeof findAuthUser>>) => {
  if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  return {
    userId: user.id,
    roles: user.roles.map(({ role }) => role.code),
    permissions: [...new Set(user.roles.flatMap(({ role }) => role.permissions.map((x) => x.permission.code)))],
  };
};

const findAuthUser = (email: string) => prisma.user.findUnique({ where: { email }, include: authUserInclude });

const sessionMetadata = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
});

export const authService = {
  async login(input: LoginInput, req: Request) {
    const user = await findAuthUser(input.email);
    const valid = user ? await argon2.verify(user.passwordHash, input.password) : false;
    if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    if (user.status !== 'active' || user.deletedAt) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');

    const claims = getAccessClaims(user);
    const refreshToken = createRefreshToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await prisma.$transaction([
      prisma.authSession.create({
        data: { userId: user.id, refreshTokenHash: hashToken(refreshToken), expiresAt, ...sessionMetadata(req) },
      }),
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);
    return { accessToken: signAccessToken(claims), refreshToken, expiresIn: env.JWT_ACCESS_EXPIRES_IN };
  },

  async refresh(refreshToken: string, req: Request) {
    const session = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { user: { include: authUserInclude } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }
    if (session.user.status !== 'active' || session.user.deletedAt) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');

    const nextToken = createRefreshToken();
    await prisma.$transaction([
      prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
      prisma.authSession.create({
        data: {
          userId: session.userId,
          refreshTokenHash: hashToken(nextToken),
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
          ...sessionMetadata(req),
        },
      }),
    ]);
    return { accessToken: signAccessToken(getAccessClaims(session.user)), refreshToken: nextToken, expiresIn: env.JWT_ACCESS_EXPIRES_IN };
  },

  async logout(refreshToken: string): Promise<void> {
    await prisma.authSession.updateMany({
      where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
