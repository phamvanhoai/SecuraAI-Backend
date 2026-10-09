import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  count: vi.fn().mockResolvedValue(11),
  findMany: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    audit_logs: mocks,
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  },
}));
import { incidentsRepository } from '../src/modules/information-security-incident-management/incidents.repository.js';
it('scopes successful assignment audits with stable bounded pagination', async () => {
  expect(await incidentsRepository.assignmentHistory('incident', 2, 10)).toEqual([11, []]);
  const where = {
    resource_type: 'INCIDENT',
    resource_id: 'incident',
    action: 'INCIDENT_HANDLER_ASSIGNED',
    outcome: 'SUCCESS',
  };
  expect(mocks.count).toHaveBeenCalledWith({ where });
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where,
      skip: 10,
      take: 10,
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    }),
  );
});
