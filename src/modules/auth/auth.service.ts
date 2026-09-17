import argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import QRCode from 'qrcode';
import type { Request } from 'express';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  createMfaChallengeToken,
  createMfaRecoveryCodes,
  createRefreshToken,
  hashToken,
  signAccessToken,
} from '../../common/utils/tokens.js';
import { decryptSecret, encryptSecret } from '../../common/utils/encryption.js';
import { authEmailService } from './auth.email.service.js';
import { authRepository } from './auth.repository.js';
import type {
  ConfirmPasswordResetBody,
  RequestPasswordResetBody,
} from './dto/password-reset.dto.js';
import type { ChangePasswordBody } from './dto/change-password.dto.js';
import type {
  SetupMfaBody,
  VerifyMfaBody,
  VerifyMfaChallengeBody,
  DisableMfaBody,
} from './dto/mfa.dto.js';
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

const getAccessClaims = (user: Awaited<ReturnType<typeof authRepository.findAuthUser>>) => {
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

const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_CHALLENGE_MAX_ATTEMPTS = 5;

const getVerifiedTimeStep = (result: { valid: boolean }): bigint => {
  if (!result.valid || !('timeStep' in result) || typeof result.timeStep !== 'number') {
    throw new AppError(400, 'INVALID_MFA_CODE', 'MFA code is invalid or expired');
  }
  return BigInt(result.timeStep);
};

// Vercel's function bundler can select otplib's CommonJS entry, whose base32
// plugin cannot require the ESM-only @scure/base package. Keeping this as a
// native dynamic import forces the ESM entry and avoids a cold-start crash.
const loadOtp = () => import('otplib');

const sessionMetadata = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
});

export const authService = {
  async setupMfa(userId: string, input: SetupMfaBody) {
    const { generateSecret, generateURI } = await loadOtp();
    const user = await authRepository.findUserForPasswordChange(userId);
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (user.status !== 'active' || user.deleted_at)
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');
    if (!(await argon2.verify(user.password_hash, input.currentPassword))) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    }

    const existing = await authRepository.findTotpMethod(userId);
    if (existing?.is_enabled) {
      throw new AppError(409, 'MFA_ALREADY_ENABLED', 'MFA is already enabled for this account');
    }

    const secret = generateSecret();
    await authRepository.saveTotpSecret(userId, encryptSecret(secret));
    const otpauthUri = generateURI({ issuer: env.APP_NAME, label: user.email, secret });
    return {
      otpauthUri,
      manualKey: secret,
      qrCodeDataUrl: await QRCode.toDataURL(otpauthUri),
      warning: 'This QR code and manual key are shown only during setup. Do not share them.',
    };
  },

  async verifyMfa(userId: string, input: VerifyMfaBody) {
    const { verify } = await loadOtp();
    const method = await authRepository.findTotpMethod(userId);
    if (!method?.secret_encrypted) {
      throw new AppError(404, 'MFA_SETUP_REQUIRED', 'MFA setup is required before verification');
    }
    if (method.is_enabled) {
      throw new AppError(409, 'MFA_ALREADY_ENABLED', 'MFA is already enabled for this account');
    }
    const result = await verify({
      secret: decryptSecret(method.secret_encrypted),
      token: input.code,
    });
    if (!result.valid) throw new AppError(400, 'INVALID_MFA_CODE', 'MFA code is invalid or expired');
    const recoveryCodes = createMfaRecoveryCodes();
    const enabled = await authRepository.enableTotpMethod(
      userId,
      getVerifiedTimeStep(result),
      recoveryCodes.map(hashToken),
    );
    if (!enabled) {
      throw new AppError(409, 'MFA_ALREADY_ENABLED', 'MFA is already enabled for this account');
    }
    return {
      recoveryCodes,
      warning: 'Store these recovery codes securely. Each code can be used only once and will not be shown again.',
    };
  },

  async disableMfa(userId: string, input: DisableMfaBody): Promise<void> {
    const user = await authRepository.findUserForPasswordChange(userId);
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (user.status !== 'active' || user.deleted_at) {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');
    }
    if (!(await argon2.verify(user.password_hash, input.currentPassword))) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    }
    const method = await authRepository.findTotpMethod(userId);
    if (!method?.is_enabled || !method.secret_encrypted) {
      throw new AppError(409, 'MFA_NOT_ENABLED', 'MFA is not enabled for this account');
    }
    const { verify } = await loadOtp();
    const result = await verify({
      secret: decryptSecret(method.secret_encrypted),
      token: input.code,
      ...(method.last_used_totp_step != null
        ? { afterTimeStep: Number(method.last_used_totp_step) }
        : {}),
    });
    if (!result.valid) throw new AppError(400, 'INVALID_MFA_CODE', 'MFA code is invalid or expired');
    const claimed = await authRepository.claimTotpTimeStep(
      method.mfa_method_id,
      getVerifiedTimeStep(result),
    );
    if (!claimed) throw new AppError(400, 'INVALID_MFA_CODE', 'MFA code is invalid or expired');
    await authRepository.disableTotpMethod(userId);
  },

  async changePassword(userId: string, input: ChangePasswordBody): Promise<void> {
    const user = await authRepository.findUserForPasswordChange(userId);
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (user.status !== 'active' || user.deleted_at)
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');

    const currentPasswordMatches = await argon2.verify(user.password_hash, input.currentPassword);
    if (!currentPasswordMatches) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    }

    if (await argon2.verify(user.password_hash, input.newPassword)) {
      throw new AppError(400, 'PASSWORD_UNCHANGED', 'New password must be different from the current password');
    }

    const passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    await authRepository.updatePassword(userId, passwordHash);
  },

  async issuePasswordReset(userId: string, email: string): Promise<void> {
    const resetToken = String(randomInt(100_000, 1_000_000));
    const tokenHash = hashToken(resetToken);
    await authRepository.createPasswordResetToken({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    try {
      await authEmailService.sendPasswordResetEmail({ to: email, token: resetToken });
    } catch (error: unknown) {
      await authRepository.deletePasswordResetToken(tokenHash);
      throw error;
    }
  },

  async requestPasswordReset(input: RequestPasswordResetBody): Promise<void> {
    const user = await authRepository.findActiveUserByEmail(input.email);
    if (!user) return;
    await this.issuePasswordReset(user.user_id, input.email);
  },

  async confirmPasswordReset(input: ConfirmPasswordResetBody): Promise<void> {
    const passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    const consumed = await authRepository.consumePasswordResetToken(
      hashToken(input.token),
      passwordHash,
    );
    if (!consumed) {
      throw new AppError(400, 'INVALID_PASSWORD_RESET_TOKEN', 'Password reset token is invalid or expired');
    }
  },

  async login(input: LoginInput, req: Request) {
    const user = await authRepository.findAuthUser(input.email);
    let valid = false;
    if (user) {
      try {
        valid = await argon2.verify(user.password_hash, input.password);
      } catch {
        valid = false;
      }
    }
    if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    if (user.status !== 'active' || user.deleted_at)
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');

    const mfaMethod = await authRepository.findTotpMethod(user.user_id);
    if (mfaMethod?.is_enabled) {
      if (!mfaMethod.secret_encrypted) {
        throw new AppError(500, 'MFA_CONFIGURATION_ERROR', 'MFA configuration is invalid');
      }
      const challengeToken = createMfaChallengeToken();
      await authRepository.createMfaLoginChallenge({
        mfaMethodId: mfaMethod.mfa_method_id,
        tokenHash: hashToken(challengeToken),
        expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
        ipAddress: sessionMetadata(req).ipAddress,
      });
      return { mfaRequired: true as const, challengeToken, expiresIn: 300 };
    }

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

  async verifyMfaChallenge(input: VerifyMfaChallengeBody, req: Request) {
    const tokenHash = hashToken(input.challengeToken);
    const challenge = await authRepository.registerMfaChallengeAttempt(tokenHash);
    if (!challenge?.secretEncrypted) {
      throw new AppError(401, 'INVALID_MFA_CHALLENGE', 'MFA challenge is invalid or expired');
    }

    const isRecoveryCode = !/^\d{6}$/.test(input.code);
    let codeValid = false;
    if (isRecoveryCode) {
      codeValid = await authRepository.consumeRecoveryCode(
        challenge.mfaMethodId,
        hashToken(input.code.toUpperCase()),
      );
    } else {
      const method = await authRepository.findTotpMethodById(challenge.mfaMethodId);
      if (method?.secret_encrypted) {
        const { verify } = await loadOtp();
        const result = await verify({
          secret: decryptSecret(method.secret_encrypted),
          token: input.code,
          ...(method.last_used_totp_step != null
            ? { afterTimeStep: Number(method.last_used_totp_step) }
            : {}),
        });
        if (result.valid) {
          codeValid = await authRepository.claimTotpTimeStep(
            challenge.mfaMethodId,
            getVerifiedTimeStep(result),
          );
        }
      }
    }
    if (!codeValid) {
      if (challenge.attempts >= MFA_CHALLENGE_MAX_ATTEMPTS) {
        await authRepository.invalidateMfaLoginChallenge(challenge.mfaMethodId, tokenHash);
      }
      throw new AppError(401, 'INVALID_MFA_CODE', 'MFA code is invalid or expired');
    }

    const refreshToken = createRefreshToken();
    const consumed = await authRepository.consumeMfaLoginChallenge({
      mfaMethodId: challenge.mfaMethodId,
      tokenHash,
      refreshTokenHash: hashToken(refreshToken),
      sessionExpiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      ipAddress: sessionMetadata(req).ipAddress,
      userAgent: sessionMetadata(req).userAgent,
    });
    if (!consumed) {
      throw new AppError(401, 'INVALID_MFA_CHALLENGE', 'MFA challenge is invalid or expired');
    }
    if (consumed.kind === 'inactive') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');
    }

    return {
      accessToken: signAccessToken(getAccessClaims(consumed.user)),
      refreshToken,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    };
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
