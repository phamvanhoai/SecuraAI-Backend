import { expect, it, vi } from 'vitest';
const findFirst = vi.hoisted(() => vi.fn());
vi.mock('../src/database/prisma.js', () => ({ prisma: { audit_logs: { findFirst } } }));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';

it('looks only for successful context changes on linked assets strictly after assessment', async () => {
  const at = new Date('2026-10-27T00:00:00Z');
  findFirst.mockResolvedValue(null);
  await expect(riskRegisterRepository.findAssetContextChange(['asset-a', 'asset-b'], at)).resolves.toBeNull();
  expect(findFirst).toHaveBeenCalledWith({
    where: { resource_type: 'ASSET', resource_id: { in: ['asset-a', 'asset-b'] },
      action: 'ASSET_CONTEXT_UPDATED', outcome: 'SUCCESS', occurred_at: { gt: at } },
    select: { id: true },
  });
});
