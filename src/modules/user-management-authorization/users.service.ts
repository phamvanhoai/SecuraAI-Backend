import { AppError } from '../../common/errors/app-error.js';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { CreateUserBody } from './dto/create-user.dto.js';
import type { ListUsersQuery } from './dto/list-users-query.dto.js';
import { usersEmailService } from './users.email.service.js';
import { usersRepository } from './users.repository.js';
import { capabilitiesForRole } from './role-capabilities.js';

export const usersService = {
  async listUsers(actorUserId: string, query: ListUsersQuery) {
    const result = await usersRepository.listUsers(actorUserId, query);
    if (result.kind === 'unauthorized') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    if (result.kind === 'forbidden') {
      throw new AppError(403, 'ADMIN_REQUIRED', 'Only administrators can view users');
    }
    const countByStatus = new Map(
      result.statusCounts.map((entry) => [entry.status, entry._count._all]),
    );
    return {
      items: result.items.map((user) => ({
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        employeeCode: null,
        department: null,
        roles: [{ code: user.role, name: user.role }],
        status: user.status,
        createdAt: user.created_at,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
      summary: {
        active: countByStatus.get('ACTIVE') ?? 0,
        inactive: countByStatus.get('INACTIVE') ?? 0,
        locked: countByStatus.get('LOCKED') ?? 0,
        disabled: 0,
      },
    };
  },
  async createUser(actorUserId: string, input: CreateUserBody) {
    const temporaryPassword = `${randomBytes(18).toString('base64url')}A!`;
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    const localPart = input.email.split('@')[0]?.replace(/[^a-z0-9._-]/g, '') || 'user';
    const username = `${localPart.slice(0, 91)}-${randomBytes(4).toString('hex')}`;
    try {
      const result = await usersRepository.createUser({
        ...input,
        actorUserId,
        username,
        passwordHash,
      });
      if (result.kind === 'unauthorized') {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      if (result.kind === 'forbidden') {
        throw new AppError(403, 'ADMIN_REQUIRED', 'Only administrators can create users');
      }
      try {
        await usersEmailService.sendAccountCreated({
          email: result.user.email,
          fullName: result.user.full_name,
          temporaryPassword,
        });
      } catch (error: unknown) {
        await usersRepository.deleteProvisionedUser(result.user.id);
        if (error instanceof AppError) throw error;
        throw new AppError(503, 'EMAIL_DELIVERY_FAILED', 'Could not send the account email');
      }
      return {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        fullName: result.user.full_name,
        role: result.user.role,
        status: result.user.status,
        message: 'User account created. A temporary password was sent by email.',
      };
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'USER_ALREADY_EXISTS', 'A user with this email already exists');
      }
      throw error;
    }
  },
  async getCurrentUser(userId: string) {
    const user = await usersRepository.findCurrentUser(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      status: user.status,
      mustChangePassword: false,
      mfaEnabled: false,
      roles: [{ code: user.role, name: user.role }],
      permissions: capabilitiesForRole(user.role),
    };
  },
};
