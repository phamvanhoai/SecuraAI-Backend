import { prisma } from '../../database/prisma.js';

const authUserSelect = {
  id: true,
  email: true,
  password_hash: true,
  role: true,
  status: true,
} as const;

export const authRepository = {
  findByEmail(email: string) {
    return prisma.users.findUnique({ where: { email }, select: authUserSelect });
  },

  findForGoogleLogin(email: string, googleSubject: string) {
    return prisma.users.findFirst({
      where: { OR: [{ google_subject: googleSubject }, { email }] },
      select: { id: true, email: true, role: true, status: true, google_subject: true },
    });
  },

  createGoogleSession(
    userId: string,
    googleSubject: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ) {
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await database.users.findUnique({
        where: { id: userId },
        select: { id: true, role: true, status: true, google_subject: true },
      });
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        (user.google_subject !== null && user.google_subject !== googleSubject)
      ) {
        return null;
      }
      await database.users.update({
        where: { id: user.id },
        data: { google_subject: googleSubject, last_login_at: new Date(), updated_at: new Date() },
        select: { id: true },
      });
      await database.auth_sessions.create({
        data: { user_id: user.id, refresh_token_hash: refreshTokenHash, expires_at: expiresAt },
        select: { id: true },
      });
      return { id: user.id, role: user.role };
    });
  },

  createSession(
    userId: string,
    expectedPasswordHash: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ) {
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await database.users.findUnique({
        where: { id: userId },
        select: { id: true, role: true, status: true, password_hash: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.password_hash !== expectedPasswordHash) {
        return null;
      }
      await database.auth_sessions.create({
        data: { user_id: user.id, refresh_token_hash: refreshTokenHash, expires_at: expiresAt },
        select: { id: true },
      });
      await database.users.update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
        select: { id: true },
      });
      return { id: user.id, role: user.role };
    });
  },

  rotateSession(refreshTokenHash: string, nextTokenHash: string, expiresAt: Date) {
    return prisma.$transaction(async (database) => {
      const session = await database.auth_sessions.findFirst({
        where: {
          refresh_token_hash: refreshTokenHash,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        select: { id: true, user_id: true, created_at: true },
      });
      if (!session) return null;

      const claimed = await database.auth_sessions.updateMany({
        where: {
          id: session.id,
          refresh_token_hash: refreshTokenHash,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        data: { revoked_at: new Date() },
      });
      if (claimed.count !== 1) return null;

      const user = await database.users.findUnique({
        where: { id: session.user_id },
        select: { id: true, role: true, status: true, password_changed_at: true },
      });
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        (user.password_changed_at && user.password_changed_at > session.created_at)
      ) {
        return null;
      }

      await database.auth_sessions.create({
        data: { user_id: user.id, refresh_token_hash: nextTokenHash, expires_at: expiresAt },
        select: { id: true },
      });
      return { id: user.id, role: user.role };
    });
  },

  async revokeSession(refreshTokenHash: string): Promise<void> {
    await prisma.auth_sessions.updateMany({
      where: { refresh_token_hash: refreshTokenHash, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  },

  findActiveUserByEmail(email: string) {
    return prisma.users.findFirst({
      where: { email, status: 'ACTIVE' },
      select: { id: true, email: true },
    });
  },

  async createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.password_reset_tokens.deleteMany({
        where: {
          OR: [{ used_at: { not: null } }, { expires_at: { lte: new Date() } }],
        },
      }),
      prisma.password_reset_tokens.deleteMany({
        where: { user_id: input.userId, used_at: null },
      }),
      prisma.password_reset_tokens.create({
        data: {
          user_id: input.userId,
          token_hash: input.tokenHash,
          expires_at: input.expiresAt,
        },
        select: { id: true },
      }),
    ]);
  },

  async deletePasswordResetToken(tokenHash: string): Promise<void> {
    await prisma.password_reset_tokens.deleteMany({ where: { token_hash: tokenHash } });
  },

  consumePasswordResetToken(tokenHash: string, passwordHash: string) {
    return prisma.$transaction(async (database) => {
      const token = await database.password_reset_tokens.findUnique({
        where: { token_hash: tokenHash },
        select: { id: true, user_id: true, expires_at: true, used_at: true },
      });
      if (!token || token.used_at || token.expires_at <= new Date()) return false;

      const claimed = await database.password_reset_tokens.updateMany({
        where: { id: token.id, used_at: null, expires_at: { gt: new Date() } },
        data: { used_at: new Date() },
      });
      if (claimed.count !== 1) return false;

      const updated = await database.users.updateMany({
        where: { id: token.user_id, status: 'ACTIVE' },
        data: {
          password_hash: passwordHash,
          password_changed_at: new Date(),
          updated_at: new Date(),
        },
      });
      if (updated.count !== 1) return false;

      await database.auth_sessions.updateMany({
        where: { user_id: token.user_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      return true;
    });
  },

  findUserForPasswordChange(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, password_hash: true, status: true },
    });
  },

  changePassword(userId: string, expectedPasswordHash: string, passwordHash: string) {
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await database.users.findUnique({
        where: { id: userId },
        select: { password_hash: true, status: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.password_hash !== expectedPasswordHash)
        return false;

      await database.users.update({
        where: { id: userId },
        data: {
          password_hash: passwordHash,
          password_changed_at: new Date(),
          updated_at: new Date(),
        },
        select: { id: true },
      });
      return true;
    });
  },
};
