import { prisma } from '../../database/prisma.js';

const resetUserSelect = { user_id: true } as const;
const passwordChangeUserSelect = {
  email: true,
  password_hash: true,
  status: true,
  deleted_at: true,
} as const;

export const authRepository = {
  findTotpMethod(userId: string) {
    return prisma.mfa_methods.findFirst({
      where: { user_id: userId, method_type: 'totp' },
      select: {
        mfa_method_id: true,
        secret_encrypted: true,
        is_enabled: true,
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

  async enableTotpMethod(userId: string): Promise<void> {
    await prisma.mfa_methods.updateMany({
      where: { user_id: userId, method_type: 'totp' },
      data: { is_enabled: true, verified_at: new Date(), updated_at: new Date() },
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