import { AppError } from '../../common/errors/app-error.js';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { CreateUserBody } from './dto/create-user.dto.js';
import type { ListUsersQuery } from './dto/list-users-query.dto.js';
import { usersEmailService } from './users.email.service.js';
import { usersRepository } from './users.repository.js';
import { capabilitiesForRole } from './role-capabilities.js';
import { userAccessScopeCatalog } from './user-access-scope-catalog.js';
import type { UpdateUserBody } from './dto/update-user.dto.js';
import type { AssignUserAccessBody } from './dto/assign-user-access.dto.js';

const roleNames = {
  ADMIN: 'Administrator',
  SECURITY_OFFICER: 'Security Officer',
  EMPLOYEE: 'Employee',
  EXECUTIVE: 'Executive',
} as const;

function mapUserDetail(user: {
  id: string;
  email: string;
  username: string;
  full_name: string;
  phone: string | null;
  employee_code: string | null;
  department_id: string | null;
  departments: { id: string; code: string; name: string } | null;
  role: 'ADMIN' | 'SECURITY_OFFICER' | 'EMPLOYEE' | 'EXECUTIVE';
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  google_subject: string | null;
  last_login_at: Date | null;
  password_changed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.full_name,
    phone: user.phone,
    employeeCode: user.employee_code,
    department: user.departments,
    role: { code: user.role, name: user.role },
    status: user.status,
    googleConnected: user.google_subject !== null,
    lastLoginAt: user.last_login_at,
    passwordChangedAt: user.password_changed_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function requireAdminResult(
  result: { kind: 'unauthorized' | 'forbidden' | 'not_found' | 'invalid_department' },
  action: string,
): never {
  if (result.kind === 'unauthorized') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (result.kind === 'forbidden') {
    throw new AppError(403, 'ADMIN_REQUIRED', `Only administrators can ${action}`);
  }
  if (result.kind === 'invalid_department') {
    throw new AppError(422, 'INVALID_DEPARTMENT', 'The selected department is not active');
  }
  throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
}

export const usersService = {
  async getUserAccessAssignmentOptions(actorUserId: string) {
    const result = await usersRepository.getUserAccessAssignmentOptions(actorUserId);
    if (result.kind !== 'found') return requireAdminResult(result, 'manage user access');
    return {
      roles: Object.entries(roleNames).map(([code, name]) => ({ code, name })),
      scopeCodes: userAccessScopeCatalog,
      targetTypes: ['GLOBAL', 'BUSINESS_SERVICE', 'ASSET'] as const,
      businessServices: result.businessServices,
      assets: result.assets,
    };
  },
  async getUserAccessAssignment(actorUserId: string, userId: string) {
    const result = await usersRepository.getUserAccessAssignment(actorUserId, userId);
    if (result.kind !== 'found') return requireAdminResult(result, 'view user access');
    return {
      user: {
        id: result.user.id,
        fullName: result.user.full_name,
        email: result.user.email,
        status: result.user.status,
      },
      role: result.user.role,
      scopes: result.scopes.map((scope) => ({
        id: scope.id,
        scopeCode: scope.scope_code,
        targetType: scope.business_service_id
          ? ('BUSINESS_SERVICE' as const)
          : scope.asset_id
            ? ('ASSET' as const)
            : ('GLOBAL' as const),
        targetId: scope.business_service_id ?? scope.asset_id,
        assignedAt: scope.assigned_at,
        expiresAt: scope.expires_at,
      })),
      ownershipSummary: result.ownershipSummary,
    };
  },
  async assignUserAccess(actorUserId: string, userId: string, input: AssignUserAccessBody) {
    const result = await usersRepository.assignUserAccess(actorUserId, userId, input);
    if (result.kind !== 'updated') {
      if (result.kind === 'invalid_scope_target') {
        throw new AppError(422, 'INVALID_SCOPE_TARGET', 'One or more scope targets are invalid');
      }
      if (result.kind === 'self_role_change') {
        throw new AppError(
          409,
          'SELF_ROLE_CHANGE_FORBIDDEN',
          'Administrators cannot change their own role',
        );
      }
      if (result.kind === 'last_admin') {
        throw new AppError(
          409,
          'LAST_ADMIN_REQUIRED',
          'The last active administrator cannot be demoted',
        );
      }
      return requireAdminResult(result, 'manage user access');
    }
    return {
      changed: result.changed,
      role: result.user.role,
      scopeCount: result.scopeCount,
    };
  },
  async listDepartments(actorUserId: string) {
    const result = await usersRepository.listDepartments(actorUserId);
    if (result.kind === 'unauthorized') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    if (result.kind === 'forbidden') {
      throw new AppError(403, 'ADMIN_REQUIRED', 'Only administrators can view departments');
    }
    return { departments: result.departments };
  },
  async getUser(actorUserId: string, userId: string) {
    const result = await usersRepository.getUserById(actorUserId, userId);
    if (result.kind !== 'found') return requireAdminResult(result, 'view user details');
    return mapUserDetail(result.user);
  },
  async updateUser(actorUserId: string, userId: string, input: UpdateUserBody) {
    try {
      const result = await usersRepository.updateUser(actorUserId, userId, input);
      if (result.kind !== 'updated') return requireAdminResult(result, 'edit users');
      return mapUserDetail(result.user);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(
          409,
          'EMPLOYEE_CODE_ALREADY_EXISTS',
          'This employee code is already in use',
        );
      }
      throw error;
    }
  },
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
        employeeCode: user.employee_code,
        department: user.departments,
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
      if (result.kind === 'invalid_department') {
        throw new AppError(422, 'INVALID_DEPARTMENT', 'The selected department is not active');
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
        throw new AppError(
          409,
          'USER_ALREADY_EXISTS',
          'A user with this email or employee code already exists',
        );
      }
      throw error;
    }
  },
  async getCurrentUser(userId: string) {
    const user = await usersRepository.findCurrentUser(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    const permissions = [...capabilitiesForRole(user.role)];
    if (user.role === 'EMPLOYEE' && user._count.risks_risks_owner_user_idTousers > 0) {
      permissions.push('risks.read', 'risks.review-reassessment', 'risks.update-treatment-plan');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      status: user.status,
      mustChangePassword: false,
      roles: [{ code: user.role, name: user.role }],
      permissions,
    };
  },
};
