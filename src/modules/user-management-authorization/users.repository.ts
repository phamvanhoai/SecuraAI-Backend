import { prisma } from '../../database/prisma.js';

export const usersRepository = {
  findCurrentUser(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        status: true,
      },
    });
  },
};
