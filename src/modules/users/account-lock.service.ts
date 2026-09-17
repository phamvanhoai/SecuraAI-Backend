import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { accountLockRepository } from './account-lock.repository.js';
import type { AccountLockBody } from './dto/account-lock.dto.js';

type Actor = { userId: string; roles: readonly string[]; permissions: readonly string[] };
const isAdmin = (
  account: NonNullable<Awaited<ReturnType<typeof accountLockRepository.findAccount>>>,
): boolean =>
  account.user_roles_user_roles_user_idTousers.some(({ roles }) => roles.code === 'ADMIN');
const permissionsOf = (
  account: NonNullable<Awaited<ReturnType<typeof accountLockRepository.findAccount>>>,
): string[] =>
  account.user_roles_user_roles_user_idTousers.flatMap(({ roles }) =>
    roles.role_permissions.map(({ permissions }) => permissions.code),
  );

export const accountLockService = {
  async change(
    userId: string,
    action: 'lock' | 'unlock',
    input: AccountLockBody,
    actor: Actor,
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    const permission = `users.${action}`;
    if (!actor.roles.includes('ADMIN'))
      throw new AppError(
        403,
        'ADMIN_REQUIRED',
        'Only administrators can lock or unlock user accounts',
      );
    if (!actor.permissions.includes(permission))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    if (userId === actor.userId)
      throw new AppError(
        403,
        'SELF_ACCOUNT_LOCK_FORBIDDEN',
        'You cannot lock or unlock your own account',
      );
    try {
      return await accountLockRepository.transaction(userId, async (database) => {
        const actingAccount = await accountLockRepository.findAccount(database, actor.userId);
        if (
          !actingAccount ||
          actingAccount.status !== 'active' ||
          !isAdmin(actingAccount) ||
          !permissionsOf(actingAccount).includes(permission)
        )
          throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
        const target = await accountLockRepository.findAccount(database, userId);
        if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
        const status = action === 'lock' ? 'locked' : 'active';
        if (target.status !== 'active' && target.status !== 'locked')
          throw new AppError(
            409,
            'ACCOUNT_STATUS_CONFLICT',
            'Only active accounts can be locked and locked accounts unlocked',
          );
        if (target.status === status)
          return {
            id: target.user_id,
            status: target.status,
            lastLockedAt: target.locked_at,
            updatedAt: target.updated_at,
            changed: false,
          };
        const permissions = permissionsOf(target);
        if (
          action === 'lock' &&
          isAdmin(target) &&
          permissions.includes('users.lock') &&
          permissions.includes('users.unlock') &&
          (await accountLockRepository.countActiveManagers(database)) <= 1
        )
          throw new AppError(
            409,
            'LAST_ACCOUNT_MANAGER',
            'The last active account manager cannot be locked',
          );
        const updated = await accountLockRepository.update(database, {
          userId,
          actorUserId: actor.userId,
          status,
          reason: input.reason,
          previousStatus: target.status,
          ...context,
        });
        return {
          id: updated.user_id,
          status: updated.status,
          lastLockedAt: updated.locked_at,
          updatedAt: updated.updated_at,
          changed: true,
        };
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new AppError(
          409,
          'ACCOUNT_STATE_CHANGED',
          'Account changed concurrently. Reload and try again',
        );
      throw error;
    }
  },
};
