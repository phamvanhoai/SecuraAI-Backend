import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { AssignUserRolesBody } from './dto/assign-user-roles.dto.js';

export const userRoleRepository = {
  listRoles() {
    return prisma.roles.findMany({
      where: { code: { not: 'ALL' } },
      select: { code: true, name: true, description: true, is_system: true },
      orderBy: { name: 'asc' },
      take: 100,
    });
  },

  assign(userId: string, actorUserId: string, body: AssignUserRolesBody) {
    return prisma.$transaction(async (database) => {
      await database.$queryRaw`SELECT user_id FROM users WHERE user_id = ${userId}::uuid FOR UPDATE`;
      const user = await database.users.findFirst({
        where: { user_id: userId, deleted_at: null },
        select: {
          status: true,
          user_roles_user_roles_user_idTousers: {
            select: { role_id: true, roles: { select: { code: true } } },
          },
        },
      });
      if (!user) return { kind: 'not_found' as const };
      if (user.status === 'disabled') return { kind: 'disabled' as const };
      const actor = await database.users.findFirst({
        where: {
          user_id: actorUserId, status: 'active', deleted_at: null,
          user_roles_user_roles_user_idTousers: { some: { roles: {
            code: 'ADMIN', role_permissions: { some: { permissions: { code: 'users.assign-role' } } },
          } } },
        },
        select: { user_id: true },
      });
      if (!actor) return { kind: 'forbidden' as const };
      const roles = await database.roles.findMany({
        where: { code: { in: body.roleCodes, not: 'ALL' } },
        select: { role_id: true, code: true },
      });
      if (roles.length !== body.roleCodes.length) return { kind: 'invalid_roles' as const };
      const existing = new Set(user.user_roles_user_roles_user_idTousers.map((item) => item.role_id));
      const additions = roles.filter((role) => !existing.has(role.role_id));
      if (additions.length > 0) {
        await database.user_roles.createMany({
          data: additions.map((role) => ({
            user_id: userId,
            role_id: role.role_id,
            assigned_by_user_id: actorUserId,
          })),
          skipDuplicates: true,
        });
        await database.auth_sessions.updateMany({
          where: { user_id: userId, revoked_at: null },
          data: { revoked_at: new Date() },
        });
        await database.audit_logs.create({
          data: {
            actor_user_id: actorUserId,
            module: 'users',
            action: 'user.roles_assigned',
            entity_type: 'user',
            entity_id: userId,
            before_data: { roleCodes: user.user_roles_user_roles_user_idTousers.map((item) => item.roles.code) },
            after_data: {
              assignedRoleCodes: additions.map((role) => role.code),
              roleCodes: [...user.user_roles_user_roles_user_idTousers.map((item) => item.roles.code), ...additions.map((role) => role.code)],
            },
          },
          select: { audit_log_id: true },
        });
      }
      return { kind: 'assigned' as const, assignedRoleCodes: additions.map((role) => role.code) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
};
