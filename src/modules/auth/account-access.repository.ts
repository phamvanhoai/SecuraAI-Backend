import { prisma } from '../../database/prisma.js';

export const accountAccessRepository = {
  findById(userId: string) {
    return prisma.users.findUnique({
      where: { user_id: userId },
      select: { status: true, deleted_at: true },
    });
  },
};
