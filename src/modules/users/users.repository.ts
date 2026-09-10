import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { CreateUserBody } from './dto/create-user.dto.js';

export const usersRepository = {
  async createInitializedUser(input: {
    body: CreateUserBody;
    passwordHash: string;
    actorUserId: string;
  }) {
    return prisma.$transaction(async (database) => {
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
} as const;