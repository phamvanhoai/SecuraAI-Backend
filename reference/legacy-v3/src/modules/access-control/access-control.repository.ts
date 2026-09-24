import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListPermissionsQuery } from './dto/permission.dto.js';
import type { CreateRoleBody, ListRolesQuery, UpdateRoleBody } from './dto/role.dto.js';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;
export const roleSelect = {
  role_id: true,
  code: true,
  name: true,
  description: true,
  is_system: true,
  created_at: true,
  updated_at: true,
  role_permissions: {
    select: {
      permissions: {
        select: { permission_id: true, code: true, module: true, action: true, description: true },
      },
    },
    orderBy: { permissions: { code: 'asc' } },
  },
  _count: { select: { user_roles: true, workflow_steps: true } },
} satisfies Prisma.rolesSelect;
export type RoleRecord = Prisma.rolesGetPayload<{ select: typeof roleSelect }>;
const sortFields = {
  code: 'code',
  name: 'name',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
} as const;
const permissionSortFields = { code: 'code', module: 'module', action: 'action' } as const;
const permissionSelect = {
  permission_id: true,
  code: true,
  module: true,
  action: true,
  description: true,
} satisfies Prisma.permissionsSelect;

export const accessControlRepository = {
  transaction<T>(operation: (database: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  },
  async listRoles(query: ListRolesQuery) {
    const where: Prisma.rolesWhereInput = {
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.roles.findMany({
        where,
        select: roleSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { [sortFields[query.sortBy]]: query.sortOrder },
      }),
      prisma.roles.count({ where }),
    ]);
    return { items, total };
  },
  async listPermissions(query: ListPermissionsQuery) {
    const where: Prisma.permissionsWhereInput = {
      ...(query.module ? { module: query.module } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { module: { contains: query.search, mode: 'insensitive' } },
              { action: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.permissions.findMany({
        where,
        select: permissionSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { [permissionSortFields[query.sortBy]]: query.sortOrder },
      }),
      prisma.permissions.count({ where }),
    ]);
    return { items, total };
  },
  findById(roleId: string, database: DatabaseClient = prisma) {
    return database.roles.findUnique({ where: { role_id: roleId }, select: roleSelect });
  },
  findByCode(code: string, database: DatabaseClient = prisma) {
    return database.roles.findUnique({ where: { code }, select: { role_id: true } });
  },
  countPermissions(permissionIds: string[], database: DatabaseClient = prisma) {
    return database.permissions.count({ where: { permission_id: { in: permissionIds } } });
  },
  create(database: DatabaseClient, input: CreateRoleBody) {
    return database.roles.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        is_system: false,
        role_permissions: {
          create: input.permissionIds.map((permissionId) => ({ permission_id: permissionId })),
        },
      },
      select: roleSelect,
    });
  },
  async update(database: DatabaseClient, roleId: string, input: UpdateRoleBody) {
    if (input.permissionIds !== undefined)
      await database.role_permissions.deleteMany({ where: { role_id: roleId } });
    return database.roles.update({
      where: { role_id: roleId },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        updated_at: new Date(),
        ...(input.permissionIds !== undefined
          ? {
              role_permissions: {
                create: input.permissionIds.map((permissionId) => ({
                  permission_id: permissionId,
                })),
              },
            }
          : {}),
      },
      select: roleSelect,
    });
  },
  async delete(database: DatabaseClient, roleId: string) {
    await database.role_permissions.deleteMany({ where: { role_id: roleId } });
    return database.roles.delete({ where: { role_id: roleId }, select: { role_id: true } });
  },
  audit(
    database: DatabaseClient,
    input: {
      actorUserId: string;
      action: string;
      roleId: string;
      beforeData?: Prisma.InputJsonObject;
      afterData?: Prisma.InputJsonObject;
    },
  ) {
    return database.audit_logs.create({
      data: {
        actor_user_id: input.actorUserId,
        module: 'access-control',
        action: input.action,
        entity_type: 'role',
        entity_id: input.roleId,
        ...(input.beforeData !== undefined ? { before_data: input.beforeData } : {}),
        ...(input.afterData !== undefined ? { after_data: input.afterData } : {}),
      },
      select: { audit_log_id: true },
    });
  },
} as const;
