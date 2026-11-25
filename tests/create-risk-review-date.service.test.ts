import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const repository = vi.hoisted(() => ({ findActor: vi.fn(), findOwner: vi.fn(), findScopeAssets: vi.fn(), create: vi.fn() }));
vi.mock('../src/modules/risk-assessment/risk-register.repository.js', () => ({ riskRegisterRepository: repository }));
import { riskRegisterService } from '../src/modules/risk-assessment/risk-register.service.js';
const id = '00000000-0000-4000-8000-000000000001';
const input = (reviewDate: string) => ({ title: 'Review date demo', description: 'Verify Vietnam calendar date validation.', ownerUserId: id, reviewDate, scope: { type: 'asset' as const, assetId: id } });
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  repository.findActor.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  repository.findOwner.mockResolvedValue({ id });
  repository.findScopeAssets.mockResolvedValue([{ id }]);
  repository.create.mockResolvedValue({ id, risk_code: 'RSK-DEMO', title: 'Demo', status: 'OPEN', created_at: new Date() });
});
afterEach(() => vi.useRealTimers());
it.each([
  ['2026-11-23T10:00:00Z', '2026-11-23'],
  ['2026-11-23T10:00:00Z', '2026-11-22'],
  ['2026-11-23T17:00:00Z', '2026-11-24'],
])('rejects today/past Vietnam dates at %s: %s', async (now, date) => {
  vi.setSystemTime(new Date(now));
  await expect(riskRegisterService.create(id, input(date))).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_REVIEW_DATE' });
  expect(repository.create).not.toHaveBeenCalled();
});
it.each([
  ['2026-11-23T10:00:00Z', '2026-11-24'],
  ['2026-11-23T16:59:59.999Z', '2026-11-24'],
  ['2026-11-23T17:00:00Z', '2026-11-25'],
])('accepts future Vietnam dates at %s: %s', async (now, date) => {
  vi.setSystemTime(new Date(now));
  await expect(riskRegisterService.create(id, input(date))).resolves.toMatchObject({ riskCode: 'RSK-DEMO' });
  expect(repository.create).toHaveBeenCalledOnce();
});
