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
};
