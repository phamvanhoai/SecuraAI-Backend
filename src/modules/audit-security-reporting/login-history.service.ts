import { AppError } from '../../common/errors/app-error.js';
import type {
  ListLoginHistoryQuery,
  LoginHistoryList,
} from './dto/list-login-history.dto.js';
import { loginHistoryRepository } from './login-history.repository.js';

export const loginHistoryService = {
  async list(userId: string, query: ListLoginHistoryQuery): Promise<LoginHistoryList> {
    const viewer = await loginHistoryRepository.findViewer(userId);
    if (!viewer || viewer.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or inactive user session');
    }
    if (
      viewer.role !== 'ADMIN' &&
      viewer.role !== 'SECURITY_OFFICER' &&
      viewer.role !== 'EMPLOYEE' &&
      viewer.role !== 'EXECUTIVE'
    ) {
      throw new AppError(403, 'FORBIDDEN', 'Login history access is restricted');
    }

    const scopedQuery =
      viewer.role === 'EMPLOYEE' || viewer.role === 'EXECUTIVE'
        ? { ...query, userId: viewer.id }
        : query;
    const result = await loginHistoryRepository.list(scopedQuery);
    return {
      items: result.items.map((item) => ({
        id: item.id,
        userId: item.user_id,
        userName: item.users?.full_name ?? null,
        email: item.email_attempted,
        loginTime: item.occurred_at.toISOString(),
        status: item.status === 'SUCCESS' ? 'success' : 'failed',
        ipAddress: item.ip_address,
        userAgent: item.user_agent,
        failureReason: item.failure_reason,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
} as const;
