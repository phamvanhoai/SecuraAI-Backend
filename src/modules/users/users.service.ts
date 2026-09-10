import { prisma } from '../../database/prisma.js';
import { AppError } from '../../common/errors/app-error.js';

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
