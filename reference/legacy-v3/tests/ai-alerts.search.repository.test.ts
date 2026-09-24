import { beforeEach, describe, expect, it, vi } from 'vitest';

const { countMock, findManyMock, transactionMock } = vi.hoisted(() => ({
  countMock: vi.fn(),
  findManyMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    ai_alerts: { count: countMock, findMany: findManyMock },
    $transaction: transactionMock,
  },
}));

import { aiAlertsRepository } from '../src/modules/ai-alerts/ai-alerts.repository.js';

describe('AI alert search repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countMock.mockReturnValue('count-query');
    findManyMock.mockReturnValue('list-query');
    transactionMock.mockResolvedValue([0, []]);
  });

  it('searches alert code, title, log source, and asset name case-insensitively', async () => {
    await aiAlertsRepository.listAlerts({
      page: 1,
      limit: 20,
      q: 'firewall',
      sortOrder: 'desc',
    });

    const expectedSearch = { contains: 'firewall', mode: 'insensitive' };
    expect(countMock).toHaveBeenCalledWith({
      where: {
        OR: [
          { alert_code: expectedSearch },
          { title: expectedSearch },
          { log_sources: { name: expectedSearch } },
          { assets: { is: { name: expectedSearch } } },
        ],
      },
    });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
    );
  });
});
