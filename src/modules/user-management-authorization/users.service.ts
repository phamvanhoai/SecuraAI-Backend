import { AppError } from '../../common/errors/app-error.js';
import { usersRepository } from './users.repository.js';

export const usersService = {
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
      permissions: [],
    };
  },
};
