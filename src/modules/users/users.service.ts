import argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { authEmailService } from '../auth/auth.email.service.js';
import type { CreateUserBody } from './dto/create-user.dto.js';
import { usersRepository } from './users.repository.js';

const publicUserSelect = {
  user_id: true,
  email: true,
  full_name: true,
  phone: true,
  employee_code: true,
  status: true,
  must_change_password: true,
  email_verified_at: true,
  last_login_at: true,
  created_at: true,
  departments: { select: { department_id: true, code: true, name: true } },
  user_roles_user_roles_user_idTousers: {
    select: {
      roles: {
        select: {
          code: true,
          name: true,
          role_permissions: { select: { permissions: { select: { code: true } } } },
        },
      },
    },
  },
} as const;

export const usersService = {
  async initializeAccount(input: CreateUserBody, actorUserId: string) {
    const temporaryPassword = String(randomInt(10_000_000, 100_000_000));
    const temporaryPasswordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });
    try {
      const result = await usersRepository.createInitializedUser({
        body: input,
        passwordHash: temporaryPasswordHash,
        actorUserId,
      });
      if (result.kind === 'invalid_roles') {
        throw new AppError(422, 'INVALID_ROLES', 'One or more role codes do not exist');
      }
      if (result.kind === 'invalid_department') {
        throw new AppError(422, 'INVALID_DEPARTMENT', 'Department does not exist or is inactive');
      }
      await authEmailService.sendInitializedAccountEmail({
        to: result.user.email,
        email: result.user.email,
        temporaryPassword,
      });
      return {
        id: result.user.user_id,
        email: result.user.email,
        fullName: result.user.full_name,
        message: 'User account created. A temporary password was sent by email.',
      };
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'USER_ALREADY_EXISTS', 'Email or employee code already exists');
      }
      throw error;
    }
  },

  async findMe(userId: string) {
    const user = await prisma.users.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: publicUserSelect,
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
    return {
      id: user.user_id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      employeeCode: user.employee_code,
      status: user.status,
      mustChangePassword: user.must_change_password,
      emailVerifiedAt: user.email_verified_at,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at,
      department: user.departments
        ? {
            id: user.departments.department_id,
            code: user.departments.code,
            name: user.departments.name,
          }
        : null,
      roles: user.user_roles_user_roles_user_idTousers.map(({ roles }) => ({
        code: roles.code,
        name: roles.name,
      })),
      permissions: [
        ...new Set(
          user.user_roles_user_roles_user_idTousers.flatMap(({ roles }) =>
            roles.role_permissions.map(({ permissions }) => permissions.code),
          ),
        ),
      ].sort(),
    };
  },
};
