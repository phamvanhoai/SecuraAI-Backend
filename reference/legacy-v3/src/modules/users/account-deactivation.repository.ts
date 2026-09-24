import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

const accountSelect = {
  user_id: true,
  status: true,
  deleted_at: true,
  disabled_at: true,
  updated_at: true,
  user_roles_user_roles_user_idTousers: {
    select: {
      roles: {
        select: {
          code: true,
          role_permissions: { select: { permissions: { select: { code: true } } } },
        },
      },
    },
  },
} satisfies Prisma.usersSelect;

export const accountDeactivationRepository = {
  transaction<T>(userId: string, operation: (database: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(async (database) => {
      // Share the lock namespace with lock/unlock to protect the last active admin.
      await database.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('users:account-lock', 0))::text`;
      await database.$queryRaw`SELECT user_id FROM users WHERE user_id = ${userId}::uuid FOR UPDATE`;
      return operation(database);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  findAccount(database: Prisma.TransactionClient, userId: string) {
    return database.users.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: accountSelect,
    });
  },

  countActiveAdmins(database: Prisma.TransactionClient) {
    return database.users.count({
      where: {
        status: 'active',
        deleted_at: null,
        user_roles_user_roles_user_idTousers: { some: { roles: { code: 'ADMIN' } } },
      },
    });
  },

  async change(database: Prisma.TransactionClient, input: {
    userId: string;
    actorUserId: string;
    action: 'deactivate' | 'remove';
    previousStatus: string;
    reason: string;
    ipAddress: string | null;
    userAgent: string | null;
  }) {
    const now = new Date();
    const account = await database.users.update({
      where: { user_id: input.userId },
      data: input.action === 'deactivate'
        ? { status: 'disabled', disabled_at: now, updated_at: now }
        : { deleted_at: now, updated_at: now },
      select: { user_id: true, status: true, disabled_at: true, deleted_at: true, updated_at: true },
    });
    await database.auth_sessions.updateMany({
      where: { user_id: input.userId, revoked_at: null },
      data: { revoked_at: now },
    });
    await database.mfa_methods.updateMany({
      where: { user_id: input.userId },
      data: {
        login_challenge_token_hash: null,
        login_challenge_expires_at: null,
        login_challenge_attempts: 0,
        login_challenge_ip: null,
        updated_at: now,
      },
    });
    await database.audit_logs.create({
      data: {
        actor_user_id: input.actorUserId,
        module: 'users',
        action: input.action === 'deactivate' ? 'user.deactivated' : 'user.removed',
        entity_type: 'user',
        entity_id: input.userId,
        before_data: { status: input.previousStatus, deleted: false },
        after_data: {
          status: account.status,
          deleted: account.deleted_at !== null,
          reason: input.reason,
        },
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      },
      select: { audit_log_id: true },
    });
    return account;
  },
};
