import { createHash, randomBytes, randomInt } from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { user_role } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { authRepository } from './auth.repository.js';
import { authEmailService } from './auth.email.service.js';
import type { LoginBody } from './dto/auth.dto.js';
import type {
  ChangePasswordBody,
  ConfirmPasswordResetBody,
  RequestPasswordResetBody,
} from './dto/password.dto.js';

const dummyHash = argon2.hash('invalid-account-password', { type: argon2.argon2id });

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

function refreshExpiresAt(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
}

function tokenPair(user: { id: string; role: user_role }, refreshToken: string) {
  const accessToken = jwt.sign({ type: 'access', role: user.role }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: 'securaai-api',
    audience: 'securaai-client',
    subject: user.id,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
  return {
    accessToken,
    refreshToken,
    expiresIn: `${env.JWT_ACCESS_TTL_SECONDS}s`,
  };
}

export const authService = {
  async login(input: LoginBody) {
    const user = await authRepository.findByEmail(input.email);
    let validPassword = false;
    try {
      validPassword = await argon2.verify(user?.password_hash ?? (await dummyHash), input.password);
    } catch {
      validPassword = false;
    }
    if (!user || !validPassword || user.status !== 'ACTIVE') {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }

    const refreshToken = createRefreshToken();
    const sessionUser = await authRepository.createSession(
      user.id,
      user.password_hash,
      hashToken(refreshToken),
      refreshExpiresAt(),
    );
    if (!sessionUser) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    return tokenPair(sessionUser, refreshToken);
  },

  async refresh(refreshToken: string) {
    const nextToken = createRefreshToken();
    const user = await authRepository.rotateSession(
      hashToken(refreshToken),
      hashToken(nextToken),
      refreshExpiresAt(),
    );
    if (!user) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }
    return tokenPair(user, nextToken);
  },

  async logout(refreshToken: string): Promise<void> {
    await authRepository.revokeSession(hashToken(refreshToken));
  },

  async requestPasswordReset(input: RequestPasswordResetBody): Promise<void> {
    const user = await authRepository.findActiveUserByEmail(input.email);
    if (!user) return;

    const token = String(randomInt(100_000, 1_000_000));
    const tokenHash = hashToken(token);
    await authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    try {
      await authEmailService.sendPasswordResetEmail({ to: user.email, token });
    } catch (error: unknown) {
      await authRepository.deletePasswordResetToken(tokenHash);
      throw error;
    }
  },

  async confirmPasswordReset(input: ConfirmPasswordResetBody): Promise<void> {
    const passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    const consumed = await authRepository.consumePasswordResetToken(
      hashToken(input.token),
      passwordHash,
    );
    if (!consumed) {
      throw new AppError(
        400,
        'INVALID_PASSWORD_RESET_TOKEN',
        'Password reset token is invalid or expired',
      );
    }
  },

  async changePassword(userId: string, input: ChangePasswordBody): Promise<void> {
    const user = await authRepository.findUserForPasswordChange(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    let currentPasswordMatches = false;
    try {
      currentPasswordMatches = await argon2.verify(user.password_hash, input.currentPassword);
    } catch {
      currentPasswordMatches = false;
    }
    if (!currentPasswordMatches) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    }
    if (await argon2.verify(user.password_hash, input.newPassword)) {
      throw new AppError(
        400,
        'PASSWORD_UNCHANGED',
        'New password must be different from the current password',
      );
    }

    const passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    const changed = await authRepository.changePassword(userId, user.password_hash, passwordHash);
    if (!changed)
      throw new AppError(409, 'PASSWORD_CHANGE_CONFLICT', 'Password changed concurrently');
  },
};
