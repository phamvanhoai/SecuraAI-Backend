import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/database/prisma.js', () => ({ prisma: {} }));
vi.mock('../src/modules/notification-system-logs/system-logs.repository.js', () => ({ systemLogsRepository: { findActor: vi.fn(), search: vi.fn() } }));
import { systemLogsRepository } from '../src/modules/notification-system-logs/system-logs.repository.js';
import { systemLogsService } from '../src/modules/notification-system-logs/system-logs.service.js';

describe('systemLogsService', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(['ADMIN', 'SECURITY_OFFICER'] as const)('allows active %s users', async (role) => {
    vi.mocked(systemLogsRepository.findActor).mockResolvedValue({ role, status: 'ACTIVE' });
    vi.mocked(systemLogsRepository.search).mockResolvedValue({ items: [], total: 0 });
    await expect(systemLogsService.search('actor-id', { page: 1, limit: 20 })).resolves.toMatchObject({ pagination: { total: 0 } });
  });
  it('rejects an Employee even if middleware is bypassed', async () => {
    vi.mocked(systemLogsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await expect(systemLogsService.search('actor-id', { page: 1, limit: 20 })).rejects.toMatchObject({ statusCode: 403 });
  });
});
