import { AppError } from '../../common/errors/app-error.js';
import { auditSettingsRepository } from './audit-settings.repository.js';
import type { ListLoginHistoryQuery, LoginHistoryList } from './dto/index.js';

export const auditSettingsService = {
  async listLoginHistory(
    query: ListLoginHistoryQuery,
    actor: { roles: string[]; permissions: string[] },
  ): Promise<LoginHistoryList> {
    if (
      !actor.roles.some((role) => role === 'ADMIN' || role === 'SECURITY_OFFICER') ||
      !actor.permissions.includes('login-history.read')
    ) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    const result = await auditSettingsRepository.listLoginHistory(query);
    return {
      items: result.items.map((item) => ({
        id: item.login_history_id,
        userId: item.user_id,
        userName: item.users?.full_name ?? null,
        email: item.email_attempted,
        loginTime: item.logged_in_at.toISOString(),
        status: item.success ? 'success' : 'failed',
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
