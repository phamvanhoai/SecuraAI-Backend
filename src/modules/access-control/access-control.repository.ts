import type { Prisma, user_role } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { roleConfigurationMarker } from './permission-catalog.js';

const principalSelect = {
  id: true,
  role: true,
  status: true,
} satisfies Prisma.usersSelect;

export const accessControlRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({ where: { id: userId }, select: principalSelect });
  },
  findUser(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, full_name: true, email: true, role: true, status: true },
    });
  },
  countUsersByRole(role: user_role) {
    return prisma.users.count({ where: { role } });
  },
  listRoleAssignments(role: user_role) {
    return prisma.user_access_scopes.findMany({
      where: {
        role,
        user_id: null,
        business_service_id: null,
        asset_id: null,
      },
      select: { scope_code: true, effect: true, assigned_at: true },
      orderBy: { assigned_at: 'desc' },
    });
  },
  listUserOverrides(userId: string) {
    return prisma.user_access_scopes.findMany({
      where: {
        user_id: userId,
        role: null,
        business_service_id: null,
        asset_id: null,
      },
      select: { scope_code: true, effect: true, assigned_at: true, expires_at: true },
      orderBy: { assigned_at: 'desc' },
    });
  },
  async replaceRolePermissions(input: {
    actorUserId: string;
    role: user_role;
    permissionCodes: readonly string[];
    reason: string;
    before: readonly string[];
  }) {
    return prisma.$transaction(
      async (transaction) => {
        const now = new Date();
        await transaction.user_access_scopes.deleteMany({
          where: { role: input.role, user_id: null },
        });
        await transaction.user_access_scopes.createMany({
          data: [roleConfigurationMarker, ...input.permissionCodes].map((scopeCode) => ({
            role: input.role,
            scope_code: scopeCode,
            effect: 'ALLOW',
            assigned_by: input.actorUserId,
            assigned_at: now,
          })),
        });
        const affectedUserCount = await transaction.users.count({ where: { role: input.role } });
        await transaction.auth_sessions.updateMany({
          where: { revoked_at: null, users: { role: input.role } },
          data: { revoked_at: now },
        });
        await transaction.audit_logs.create({
          data: {
            actor_user_id: input.actorUserId,
            actor_type: 'USER',
            action: 'ROLE_PERMISSIONS_CONFIGURED',
            resource_type: 'ROLE',
            source: 'API',
            before_data: { role: input.role, permissionCodes: [...input.before] },
            after_data: {
              role: input.role,
              permissionCodes: [...input.permissionCodes],
              reason: input.reason,
              affectedUserCount,
            },
            record_hash: `ROLE_PERMISSIONS_CONFIGURED:${input.role}:${input.actorUserId}:${now.getTime()}`,
          },
        });
        return { updatedAt: now, affectedUserCount };
      },
      { maxWait: 5_000, timeout: 20_000 },
    );
  },
  async replaceUserOverrides(input: {
    actorUserId: string;
    userId: string;
    allow: readonly string[];
    deny: readonly string[];
    reason: string;
    beforeAllow: readonly string[];
    beforeDeny: readonly string[];
  }) {
    return prisma.$transaction(
      async (transaction) => {
        const now = new Date();
        await transaction.user_access_scopes.deleteMany({
          where: {
            user_id: input.userId,
            role: null,
            business_service_id: null,
            asset_id: null,
            scope_code: { in: [...input.beforeAllow, ...input.beforeDeny] },
          },
        });
        const rows = [
          ...input.allow.map((scopeCode) => ({ scopeCode, effect: 'ALLOW' })),
          ...input.deny.map((scopeCode) => ({ scopeCode, effect: 'DENY' })),
        ];
        if (rows.length > 0) {
          await transaction.user_access_scopes.createMany({
            data: rows.map(({ scopeCode, effect }) => ({
              user_id: input.userId,
              scope_code: scopeCode,
              effect,
              assigned_by: input.actorUserId,
              assigned_at: now,
            })),
          });
        }
        await transaction.auth_sessions.updateMany({
          where: { user_id: input.userId, revoked_at: null },
          data: { revoked_at: now },
        });
        await transaction.audit_logs.create({
          data: {
            actor_user_id: input.actorUserId,
            actor_type: 'USER',
            action: 'USER_PERMISSIONS_CONFIGURED',
            resource_type: 'USER',
            resource_id: input.userId,
            source: 'API',
            before_data: { allow: [...input.beforeAllow], deny: [...input.beforeDeny] },
            after_data: { allow: [...input.allow], deny: [...input.deny], reason: input.reason },
            record_hash: `USER_PERMISSIONS_CONFIGURED:${input.userId}:${input.actorUserId}:${now.getTime()}`,
          },
        });
        return { updatedAt: now };
      },
      { maxWait: 5_000, timeout: 20_000 },
    );
  },
} as const;
