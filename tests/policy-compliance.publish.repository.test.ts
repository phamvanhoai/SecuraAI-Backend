import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  findFirstVersion: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    policies: { count: mocks.count, findMany: mocks.findMany },
    policy_versions: { findFirst: mocks.findFirstVersion },
    $transaction: mocks.transaction,
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance/policy-compliance.repository.js';

describe('policyComplianceRepository publish review queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockReturnValue(Promise.resolve(1));
    mocks.findMany.mockReturnValue(Promise.resolve([]));
    mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
  });

  it('lists only policies containing a draft version with bounded pagination', async () => {
    await policyComplianceRepository.listPublishablePolicies({
      page: 2,
      limit: 10,
      q: 'ISP',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'draft',
          policy_versions: { some: { status: 'draft' } },
        }),
        skip: 10,
        take: 10,
      }),
    );
  });

  it('loads detail only when the version belongs to the policy and is a draft', async () => {
    await policyComplianceRepository.getDraftPolicyVersion('policy-id', 'version-id');
    expect(mocks.findFirstVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          policy_id: 'policy-id',
          policy_version_id: 'version-id',
          status: 'draft',
        },
      }),
    );
  });
});
