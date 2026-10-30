import { AppError } from '../../common/errors/app-error.js';
import { authRepository } from './auth.repository.js';

export async function assertAccessTokenCurrent(
  userId: string,
  passwordVersion: number | undefined,
  issuedAt: number | undefined,
): Promise<void> {
  const user = await authRepository.findAccessTokenUser(userId);
  if (!user || user.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  const changedAt = user.password_changed_at?.getTime() ?? 0;
  const stale =
    passwordVersion !== undefined
      ? passwordVersion !== changedAt
      : changedAt > 0 && (!issuedAt || issuedAt * 1000 <= changedAt);
  if (stale) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
}
