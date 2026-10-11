import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    audit_logs: mocks,
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  },
}));
import { incidentsRepository } from '../src/modules/information-security-incident-management/incidents.repository.js';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.count.mockResolvedValue(1);
  mocks.findMany.mockResolvedValue([]);
});
it('scopes audit queries to successful classifications and bounds/order the page', async () => {
  await incidentsRepository.classificationHistory('incident-id', 3, 10);
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        resource_type: 'INCIDENT',
        resource_id: 'incident-id',
        action: 'INCIDENT_SEVERITY_CLASSIFIED',
        outcome: 'SUCCESS',
      },
      skip: 20,
      take: 10,
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    }),
  );
  expect(mocks.count).toHaveBeenCalledWith({
    where: expect.objectContaining({ resource_id: 'incident-id' }),
  });
});
