import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/audit-security-reporting/login-history.repository.js', () => ({
  loginHistoryRepository: { findViewer: vi.fn(), list: vi.fn() },
}));

import { loginHistoryRepository } from '../src/modules/audit-security-reporting/login-history.repository.js';
import { loginHistoryService } from '../src/modules/audit-security-reporting/login-history.service.js';

const viewerId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';

describe('login history service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loginHistoryRepository.findViewer).mockResolvedValue({
      id: viewerId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(loginHistoryRepository.list).mockResolvedValue({
      items: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          user_id: viewerId,
          occurred_at: new Date('2026-10-20T08:00:00.000Z'),
          email_attempted: 'admin@example.test',
          status: 'SUCCESS',
          failure_reason: null,
          ip_address: null,
          user_agent: null,
          users: { full_name: 'System Admin', email: 'admin@example.test' },
        },
      ],
      total: 1,
      summary: { successful: 18, failed: 2, accounts: 5 },
    });
  });

  it('returns mapped sessions for an active administrator', async () => {
    const result = await loginHistoryService.list(viewerId, {
      page: 1,
      limit: 20,
      sortBy: 'loginTime',
      sortOrder: 'desc',
    });
    expect(result.items[0]).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: viewerId,
      userName: 'System Admin',
      email: 'admin@example.test',
      loginTime: '2026-10-20T08:00:00.000Z',
      status: 'success',
      ipAddress: null,
      userAgent: null,
      failureReason: null,
    });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(result.summary).toEqual({ successful: 18, failed: 2, accounts: 5 });
  });

  it('allows an active Security Officer', async () => {
    vi.mocked(loginHistoryRepository.findViewer).mockResolvedValue({
      id: viewerId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    await expect(
      loginHistoryService.list(viewerId, {
        page: 1,
        limit: 20,
        sortBy: 'loginTime',
        sortOrder: 'desc',
      }),
    ).resolves.toBeDefined();
  });

  it('scopes employees to their own login history', async () => {
    vi.mocked(loginHistoryRepository.findViewer).mockResolvedValue({
      id: viewerId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    vi.mocked(loginHistoryRepository.list).mockResolvedValue({
      items: [],
      total: 0,
      summary: { successful: 0, failed: 0, accounts: 0 },
    });

    await loginHistoryService.list(viewerId, {
      page: 1,
      limit: 20,
      sortBy: 'loginTime',
      sortOrder: 'desc',
      userId: '00000000-0000-0000-0000-000000000099',
    });

    expect(loginHistoryRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: viewerId }),
    );
  });

  it('scopes Executives to their own login history', async () => {
    vi.mocked(loginHistoryRepository.findViewer).mockResolvedValue({
      id: viewerId,
      role: 'EXECUTIVE',
      status: 'ACTIVE',
    });
    vi.mocked(loginHistoryRepository.list).mockResolvedValue({
      items: [],
      total: 0,
      summary: { successful: 0, failed: 0, accounts: 0 },
    });

    await loginHistoryService.list(viewerId, {
      page: 1,
      limit: 20,
      sortBy: 'loginTime',
      sortOrder: 'desc',
    });

    expect(loginHistoryRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: viewerId }),
    );
  });
});
