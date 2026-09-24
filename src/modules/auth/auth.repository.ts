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
  async createLoginSession(input: {
    userId: string;
    passwordHash: string;
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
        user.password_hash !== input.passwordHash
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
