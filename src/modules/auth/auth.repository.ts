import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

const authUserInclude = {
  user_roles_user_roles_user_idTousers: {
    include: {
      roles: {
        include: { role_permissions: { include: { permissions: true } } },
      },
    },
  },
} as const;

const resetUserSelect = { user_id: true } as const;
const passwordChangeUserSelect = {
  email: true,
  password_hash: true,
  status: true,
  deleted_at: true,
} as const;

export const authRepository = {
  async recordLoginFailure(input: {
    userId: string | null;
    email: string;
    reason: string;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await prisma.login_history.create({
      data: {
        user_id: input.userId,
        email_attempted: input.email,
        success: false,
        failure_reason: input.reason,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      },
      select: { login_history_id: true },
    });
  },
  async createLoginSession(input: {
    userId: string;
    passwordHash: string;
    expectedLockVersion: string | null;
    refreshTokenHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }) {
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT user_id FROM users WHERE user_id = ${input.userId}::uuid FOR UPDATE`;
      const user = await database.users.findUnique({
        where: { user_id: input.userId },
        include: authUserInclude,
      });
      if (
        !user ||
        user.status !== 'active' ||
        user.deleted_at ||
        user.password_hash !== input.passwordHash ||
        (user.locked_at?.toISOString() ?? null) !== input.expectedLockVersion
      )
        return null;
      await database.auth_sessions.create({
        data: {
          user_id: user.user_id,
          refresh_token_hash: input.refreshTokenHash,
          expires_at: input.expiresAt,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
        },
        select: { auth_session_id: true },
      });
      await database.users.update({
        where: { user_id: user.user_id },
        data: { last_login_at: new Date() },
        select: { user_id: true },
      });
      await database.login_history.create({
        data: {
          user_id: user.user_id,
          email_attempted: user.email,
          success: true,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
        },
        select: { login_history_id: true },
      });
      return user;
    });
  },
  async rotateRefreshSession(input: {
    tokenHash: string;
    nextTokenHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }) {
    const session = await prisma.auth_sessions.findFirst({
      where: { refresh_token_hash: input.tokenHash },
      select: { user_id: true },
    });
    if (!session) return null;
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT user_id FROM users WHERE user_id = ${session.user_id}::uuid FOR UPDATE`;
      const current = await database.auth_sessions.findFirst({
        where: {
          refresh_token_hash: input.tokenHash,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        select: { auth_session_id: true },
      });
      const user = await database.users.findUnique({
        where: { user_id: session.user_id },
        include: authUserInclude,
      });
      if (!current || !user || user.status !== 'active' || user.deleted_at) return null;
      await database.auth_sessions.update({
        where: { auth_session_id: current.auth_session_id },
        data: { revoked_at: new Date() },
        select: { auth_session_id: true },
      });
      await database.auth_sessions.create({
        data: {
          user_id: user.user_id,
          refresh_token_hash: input.nextTokenHash,
          expires_at: input.expiresAt,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
        },
        select: { auth_session_id: true },
      });
      return user;
    });
  },
  findAuthUser(email: string) {
    return prisma.users.findUnique({ where: { email }, include: authUserInclude });
  },

  findTotpMethod(userId: string) {
    return prisma.mfa_methods.findFirst({
      where: { user_id: userId, method_type: 'totp' },
      select: {
        mfa_method_id: true,
        secret_encrypted: true,
        is_enabled: true,
        last_used_totp_step: true,
        recovery_code_hashes: true,
      },
    });
  },

  async saveTotpSecret(userId: string, secretEncrypted: string): Promise<void> {
    const existing = await prisma.mfa_methods.findFirst({
      where: { user_id: userId, method_type: 'totp' },
      select: { mfa_method_id: true },
    });
    if (existing) {
      await prisma.mfa_methods.update({
        where: { mfa_method_id: existing.mfa_method_id },
        data: {
          secret_encrypted: secretEncrypted,
          is_enabled: false,
          verified_at: null,
          last_used_totp_step: null,
          recovery_code_hashes: Prisma.DbNull,
          updated_at: new Date(),
        },
      });
      return;
    }
    await prisma.mfa_methods.create({
      data: {
        user_id: userId,
        method_type: 'totp',
        secret_encrypted: secretEncrypted,
      },
    });
  },

  async enableTotpMethod(
    userId: string,
    timeStep: bigint,
    recoveryCodeHashes: string[],
  ): Promise<boolean> {
    const enabled = await prisma.mfa_methods.updateMany({
      where: {
        user_id: userId,
        method_type: 'totp',
        is_enabled: false,
        last_used_totp_step: null,
      },
      data: {
        is_enabled: true,
        verified_at: new Date(),
        last_used_totp_step: timeStep,
        recovery_code_hashes: recoveryCodeHashes,
        updated_at: new Date(),
      },
    });
    return enabled.count === 1;
  },

  findTotpMethodById(mfaMethodId: string) {
    return prisma.mfa_methods.findUnique({
      where: { mfa_method_id: mfaMethodId },
      select: {
        secret_encrypted: true,
        last_used_totp_step: true,
      },
    });
  },

  async claimTotpTimeStep(mfaMethodId: string, timeStep: bigint): Promise<boolean> {
    const claimed = await prisma.mfa_methods.updateMany({
      where: {
        mfa_method_id: mfaMethodId,
        OR: [{ last_used_totp_step: null }, { last_used_totp_step: { lt: timeStep } }],
      },
      data: { last_used_totp_step: timeStep, updated_at: new Date() },
    });
    return claimed.count === 1;
  },

  async consumeRecoveryCode(mfaMethodId: string, codeHash: string): Promise<boolean> {
    return prisma.$transaction(async (database) => {
      const method = await database.mfa_methods.findUnique({
        where: { mfa_method_id: mfaMethodId },
        select: { recovery_code_hashes: true },
      });
      if (!Array.isArray(method?.recovery_code_hashes)) return false;
      const hashes = method.recovery_code_hashes.filter(
        (value): value is string => typeof value === 'string',
      );
      if (!hashes.includes(codeHash)) return false;
      const remaining = hashes.filter((hash) => hash !== codeHash);
      const updated = await database.mfa_methods.updateMany({
        where: { mfa_method_id: mfaMethodId, recovery_code_hashes: { equals: hashes } },
        data: { recovery_code_hashes: remaining, updated_at: new Date() },
      });
      return updated.count === 1;
    });
  },

  async disableTotpMethod(userId: string): Promise<void> {
    await prisma.$transaction([
      prisma.mfa_methods.updateMany({
        where: { user_id: userId, method_type: 'totp', is_enabled: true },
        data: {
          secret_encrypted: null,
          is_enabled: false,
          verified_at: null,
          last_used_totp_step: null,
          recovery_code_hashes: Prisma.DbNull,
          login_challenge_token_hash: null,
          login_challenge_expires_at: null,
          login_challenge_attempts: 0,
          login_challenge_ip: null,
          updated_at: new Date(),
        },
      }),
      prisma.auth_sessions.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    ]);
  },

  async createMfaLoginChallenge(input: {
    mfaMethodId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    expectedLockVersion: string | null;
    passwordHash: string;
  }): Promise<boolean> {
    return prisma.$transaction(async (database) => {
      const method = await database.mfa_methods.findUnique({
        where: { mfa_method_id: input.mfaMethodId },
        select: { user_id: true },
      });
      if (!method) return false;
      await database.$queryRaw`SELECT user_id FROM users WHERE user_id = ${method.user_id}::uuid FOR UPDATE`;
      const user = await database.users.findUnique({
        where: { user_id: method.user_id },
        select: { status: true, deleted_at: true, locked_at: true, password_hash: true },
      });
      if (
        !user ||
        user.status !== 'active' ||
        user.deleted_at ||
        user.password_hash !== input.passwordHash ||
        (user.locked_at?.toISOString() ?? null) !== input.expectedLockVersion
      )
        return false;
      await database.mfa_methods.update({
        where: { mfa_method_id: input.mfaMethodId },
        data: {
          login_challenge_token_hash: input.tokenHash,
          login_challenge_expires_at: input.expiresAt,
          login_challenge_attempts: 0,
          login_challenge_ip: input.ipAddress,
          updated_at: new Date(),
        },
      });
      return true;
    });
  },

  async registerMfaChallengeAttempt(tokenHash: string) {
    return prisma.$transaction(async (database) => {
      const challenge = await database.mfa_methods.findFirst({
        where: {
          login_challenge_token_hash: tokenHash,
          login_challenge_expires_at: { gt: new Date() },
          login_challenge_attempts: { lt: 5 },
          is_enabled: true,
          method_type: 'totp',
        },
        select: {
          mfa_method_id: true,
          secret_encrypted: true,
          user_id: true,
          users: { select: { email: true } },
          login_challenge_attempts: true,
        },
      });
      if (!challenge) return null;

      const claimed = await database.mfa_methods.updateMany({
        where: {
          mfa_method_id: challenge.mfa_method_id,
          login_challenge_token_hash: tokenHash,
          login_challenge_expires_at: { gt: new Date() },
          login_challenge_attempts: challenge.login_challenge_attempts,
        },
        data: { login_challenge_attempts: { increment: 1 }, updated_at: new Date() },
      });
      if (claimed.count !== 1) return null;
      return {
        mfaMethodId: challenge.mfa_method_id,
        secretEncrypted: challenge.secret_encrypted,
        userId: challenge.user_id,
        email: challenge.users.email,
        attempts: challenge.login_challenge_attempts + 1,
      };
    });
  },

  async invalidateMfaLoginChallenge(mfaMethodId: string, tokenHash: string): Promise<void> {
    await prisma.mfa_methods.updateMany({
      where: { mfa_method_id: mfaMethodId, login_challenge_token_hash: tokenHash },
      data: {
        login_challenge_token_hash: null,
        login_challenge_expires_at: null,
        login_challenge_ip: null,
        updated_at: new Date(),
      },
    });
  },

  async consumeMfaLoginChallenge(input: {
    mfaMethodId: string;
    tokenHash: string;
    refreshTokenHash: string;
    sessionExpiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }) {
    return prisma.$transaction(async (database) => {
      const challengedMethod = await database.mfa_methods.findUnique({
        where: { mfa_method_id: input.mfaMethodId },
        select: { user_id: true },
      });
      if (!challengedMethod) return null;
      await database.$queryRaw`SELECT user_id FROM users WHERE user_id = ${challengedMethod.user_id}::uuid FOR UPDATE`;
      const consumed = await database.mfa_methods.updateMany({
        where: {
          mfa_method_id: input.mfaMethodId,
          login_challenge_token_hash: input.tokenHash,
          login_challenge_expires_at: { gt: new Date() },
          login_challenge_attempts: { lte: 5 },
        },
        data: {
          login_challenge_token_hash: null,
          login_challenge_expires_at: null,
          login_challenge_ip: null,
          updated_at: new Date(),
        },
      });
      if (consumed.count !== 1) return null;

      const method = await database.mfa_methods.findUnique({
        where: { mfa_method_id: input.mfaMethodId },
        select: { user_id: true },
      });
      if (!method) return null;

      const user = await database.users.findUnique({
        where: { user_id: method.user_id },
        include: authUserInclude,
      });
      if (!user) return null;
      if (user.status !== 'active' || user.deleted_at) return { kind: 'inactive' as const };

      await database.auth_sessions.create({
        data: {
          user_id: method.user_id,
          refresh_token_hash: input.refreshTokenHash,
          expires_at: input.sessionExpiresAt,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
        },
      });
      const authenticatedUser = await database.users.update({
        where: { user_id: method.user_id },
        data: { last_login_at: new Date() },
        include: authUserInclude,
      });
      await database.login_history.create({
        data: {
          user_id: authenticatedUser.user_id,
          email_attempted: authenticatedUser.email,
          success: true,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
        },
        select: { login_history_id: true },
      });
      return { kind: 'authenticated' as const, user: authenticatedUser };
    });
  },

  findUserForPasswordChange(userId: string) {
    return prisma.users.findFirst({
      where: { user_id: userId },
      select: passwordChangeUserSelect,
    });
  },

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await prisma.$transaction([
      prisma.users.update({
        where: { user_id: userId },
        data: { password_hash: passwordHash, must_change_password: false },
      }),
      prisma.auth_sessions.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    ]);
  },

  findActiveUserByEmail(email: string) {
    return prisma.users.findFirst({
      where: { email, status: 'active', deleted_at: null },
      select: resetUserSelect,
    });
  },

  async createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.password_reset_tokens.deleteMany({
        where: { user_id: input.userId, used_at: null },
      }),
      prisma.password_reset_tokens.create({
        data: {
          user_id: input.userId,
          token_hash: input.tokenHash,
          expires_at: input.expiresAt,
        },
      }),
    ]);
  },

  async deletePasswordResetToken(tokenHash: string): Promise<void> {
    await prisma.password_reset_tokens.deleteMany({ where: { token_hash: tokenHash } });
  },

  async consumePasswordResetToken(tokenHash: string, passwordHash: string): Promise<boolean> {
    return prisma.$transaction(async (database) => {
      const resetToken = await database.password_reset_tokens.findFirst({
        where: {
          token_hash: tokenHash,
          used_at: null,
          expires_at: { gt: new Date() },
          users: { status: 'active', deleted_at: null },
        },
        select: { password_reset_token_id: true, user_id: true },
      });
      if (!resetToken) return false;

      const claimed = await database.password_reset_tokens.updateMany({
        where: { password_reset_token_id: resetToken.password_reset_token_id, used_at: null },
        data: { used_at: new Date() },
      });
      if (claimed.count !== 1) return false;

      await database.users.update({
        where: { user_id: resetToken.user_id },
        data: { password_hash: passwordHash, must_change_password: false },
      });
      await database.auth_sessions.updateMany({
        where: { user_id: resetToken.user_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      return true;
    });
  },
} as const;
