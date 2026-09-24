import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { CreateUserBody } from './dto/create-user.dto.js';
import type { ListUsersQuery } from './dto/list-users-query.dto.js';
import type { UpdateUserBody } from './dto/update-user.dto.js';

const userListSelect = {
  user_id: true,
  email: true,
  full_name: true,
  employee_code: true,
  status: true,
  created_at: true,
  departments: { select: { department_id: true, code: true, name: true } },
  user_roles_user_roles_user_idTousers: {
    select: { roles: { select: { code: true, name: true } } },
  },
} as const;

const userDetailSelect = {
  user_id: true,
  department_id: true,
  email: true,
  full_name: true,
  phone: true,
  employee_code: true,
  avatar_url: true,
  status: true,
  must_change_password: true,
  email_verified_at: true,
  last_login_at: true,
  disabled_at: true,
  created_at: true,
  updated_at: true,
  departments: { select: { department_id: true, code: true, name: true } },
  user_roles_user_roles_user_idTousers: {
    select: {
      assigned_at: true,
      roles: { select: { role_id: true, code: true, name: true, description: true } },
    },
  },
} as const;

export const usersRepository = {
  async listCreateOptions() {
    const [departments, roles] = await prisma.$transaction([
      prisma.departments.findMany({
        where: { status: 'active' },
        select: { department_id: true, code: true, name: true },
        orderBy: [{ name: 'asc' }, { department_id: 'asc' }],
      }),
      prisma.roles.findMany({
        select: { role_id: true, code: true, name: true, description: true, is_system: true },
        orderBy: [{ name: 'asc' }, { role_id: 'asc' }],
      }),
    ]);
    return { departments, roles };
  },

  findById(userId: string) {
    return prisma.users.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: userDetailSelect,
    });
  },

  async list(query: ListUsersQuery) {
    const where = {
      deleted_at: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { department_id: query.departmentId } : {}),
      ...(query.roleCode
        ? { user_roles_user_roles_user_idTousers: { some: { roles: { code: query.roleCode } } } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { full_name: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { employee_code: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total, active, inactive, disabled] = await prisma.$transaction([
      prisma.users.findMany({
        where,
        select: userListSelect,
        orderBy: { created_at: 'desc' },
        skip,
        take: query.limit,
      }),
      prisma.users.count({ where }),
      prisma.users.count({ where: { ...where, status: 'active' } }),
      prisma.users.count({ where: { ...where, status: 'inactive' } }),
      prisma.users.count({ where: { ...where, status: 'disabled' } }),
    ]);
    return { items, total, summary: { active, inactive, disabled } };
  },

  async createInitializedUser(input: {
    body: CreateUserBody;
    passwordHash: string;
    actorUserId: string;
  }) {
    return prisma.$transaction(
      async (database) => {
        const roles = await database.roles.findMany({
          where: { code: { in: input.body.roleCodes } },
          select: { role_id: true, code: true },
        });
        if (roles.length !== new Set(input.body.roleCodes).size) {
          return { kind: 'invalid_roles' as const };
        }
        if (input.body.departmentId) {
          const department = await database.departments.findFirst({
            where: { department_id: input.body.departmentId, status: 'active' },
            select: { department_id: true },
          });
          if (!department) return { kind: 'invalid_department' as const };
        }

        const user = await database.users.create({
          data: {
            email: input.body.email,
            full_name: input.body.fullName,
            password_hash: input.passwordHash,
            ...(input.body.phone !== undefined ? { phone: input.body.phone } : {}),
            ...(input.body.employeeCode !== undefined
              ? { employee_code: input.body.employeeCode }
              : {}),
            department_id: input.body.departmentId ?? null,
            status: 'active',
            must_change_password: true,
            created_by_user_id: input.actorUserId,
            user_roles_user_roles_user_idTousers: {
              create: roles.map((role) => ({
                role_id: role.role_id,
                assigned_by_user_id: input.actorUserId,
              })),
            },
          },
          select: { user_id: true, email: true, full_name: true },
        });
        await database.audit_logs.create({
          data: {
            actor_user_id: input.actorUserId,
            module: 'users',
            action: 'user.initialized',
            entity_type: 'user',
            entity_id: user.user_id,
            after_data: {
              email: user.email,
              fullName: user.full_name,
              roleCodes: roles.map((role) => role.code),
            },
          },
          select: { audit_log_id: true },
        });
        return { kind: 'created' as const, user };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  },

  async updateUser(input: { userId: string; body: UpdateUserBody; actorUserId: string }) {
    return prisma.$transaction(async (database) => {
      const current = await database.users.findFirst({
        where: { user_id: input.userId, deleted_at: null },
        select: userDetailSelect,
      });
      if (!current) return { kind: 'not_found' as const };

      if (input.body.departmentId) {
        const department = await database.departments.findFirst({
          where: { department_id: input.body.departmentId, status: 'active' },
          select: { department_id: true },
        });
        if (!department) return { kind: 'invalid_department' as const };
      }


      const updated = await database.users.update({
        where: { user_id: input.userId },
        data: {
          ...(input.body.fullName !== undefined ? { full_name: input.body.fullName } : {}),
          ...(input.body.phone !== undefined ? { phone: input.body.phone } : {}),
          ...(input.body.employeeCode !== undefined
            ? { employee_code: input.body.employeeCode }
            : {}),
          ...(input.body.departmentId !== undefined
            ? { department_id: input.body.departmentId }
            : {}),
          updated_at: new Date(),
        },
        select: userDetailSelect,
      });
      await database.audit_logs.create({
        data: {
          actor_user_id: input.actorUserId,
          module: 'users',
          action: 'user.updated',
          entity_type: 'user',
          entity_id: input.userId,
          before_data: {
            fullName: current.full_name,
            phone: current.phone,
            employeeCode: current.employee_code,
            departmentId: current.department_id,
            roleCodes: current.user_roles_user_roles_user_idTousers.map(({ roles: role }) => role.code),
          },
          after_data: {
            fullName: updated.full_name,
            phone: updated.phone,
            employeeCode: updated.employee_code,
            departmentId: updated.department_id,
            roleCodes: updated.user_roles_user_roles_user_idTousers.map(({ roles: role }) => role.code),
          },
        },
        select: { audit_log_id: true },
      });
      return { kind: 'updated' as const, user: updated };
    });
  },
} as const;
