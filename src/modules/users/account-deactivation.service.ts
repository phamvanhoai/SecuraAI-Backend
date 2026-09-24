import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { accountDeactivationRepository } from './account-deactivation.repository.js';
import type { DeactivateUserBody } from './dto/deactivate-user.dto.js';

type Actor = { userId: string; roles: readonly string[]; permissions: readonly string[] };
type Account = NonNullable<Awaited<ReturnType<typeof accountDeactivationRepository.findAccount>>>;
const isAdmin = (account: Account): boolean =>
  account.user_roles_user_roles_user_idTousers.some(({ roles }) => roles.code === 'ADMIN');
const hasPermission = (account: Account, permission: string): boolean =>
  account.user_roles_user_roles_user_idTousers.some(({ roles }) =>
    roles.role_permissions.some(({ permissions }) => permissions.code === permission),
  );

export const accountDeactivationService = {
  async change(
    userId: string,
    action: 'deactivate' | 'remove',
    input: DeactivateUserBody,
    actor: Actor,
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    const permission = `users.${action}`;
    if (!actor.roles.includes('ADMIN'))
      throw new AppError(403, 'ADMIN_REQUIRED', 'Only administrators can manage account removal');
    if (!actor.permissions.includes(permission))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    if (userId === actor.userId)
      throw new AppError(403, 'SELF_ACCOUNT_CHANGE_FORBIDDEN', 'You cannot change your own account');

    try {
      return await accountDeactivationRepository.transaction(userId, async (database) => {
        const actingAccount = await accountDeactivationRepository.findAccount(database, actor.userId);
        if (!actingAccount || actingAccount.status !== 'active' || !isAdmin(actingAccount) ||
          !hasPermission(actingAccount, permission))
          throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
        const target = await accountDeactivationRepository.findAccount(database, userId);
        if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
        if (action === 'deactivate' && target.status === 'disabled')
          return { id: target.user_id, status: target.status, disabledAt: target.disabled_at,
            deletedAt: null, updatedAt: target.updated_at, changed: false };
        if (target.status === 'active' && isAdmin(target) &&
          (await accountDeactivationRepository.countActiveAdmins(database)) <= 1)
          throw new AppError(409, 'LAST_ACTIVE_ADMIN', 'The last active administrator cannot be removed');

        const updated = await accountDeactivationRepository.change(database, {
          userId, actorUserId: actor.userId, action,
          previousStatus: target.status, reason: input.reason, ...context,
        });
        return { id: updated.user_id, status: updated.status,
          disabledAt: updated.disabled_at, deletedAt: updated.deleted_at,
          updatedAt: updated.updated_at, changed: true };
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(409, 'ACCOUNT_STATE_CHANGED', 'Account changed concurrently. Reload and try again');
      throw error;
    }
  },
};
