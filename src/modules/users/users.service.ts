import { prisma } from '@/database/prisma.js';
import { AppError } from '@/common/errors/app-error.js';

const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  employeeCode: true,
  status: true,
  mustChangePassword: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  department: { select: { id: true, code: true, name: true } },
  roles: { select: { role: { select: { code: true, name: true } } } },
} as const;

export const usersService = {
  async findMe(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: publicUserSelect,
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
    return { ...user, roles: user.roles.map(({ role }) => role) };
  },
};
