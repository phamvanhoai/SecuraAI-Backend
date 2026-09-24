import { AppError } from '../../common/errors/app-error.js';
import { accountAccessRepository } from './account-access.repository.js';

export const accountAccessService = {
  async verify(userId: string): Promise<void> {
    const user = await accountAccessRepository.findById(userId);
    if (!user || user.deleted_at || user.status !== 'active') {
      throw new AppError(
        401,
        'ACCOUNT_ACCESS_REVOKED',
        'Account access is unavailable. Please sign in again',
      );
    }
  },
};
