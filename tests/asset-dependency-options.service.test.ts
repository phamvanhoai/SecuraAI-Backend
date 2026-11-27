import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({ assetsRepository: { findActor: vi.fn(), findById: vi.fn(), dependencyOptions: vi.fn() } }));
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
describe('dependency options access', () => {
  beforeEach(() => vi.resetAllMocks());
  it('rejects an Employee even if an Asset Owner', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await expect(assetsService.dependencyOptions('owner', 'asset', '')).rejects.toMatchObject({ statusCode: 403 });
    expect(assetsRepository.dependencyOptions).not.toHaveBeenCalled();
  });
  it('rejects an inactive actor', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'LOCKED' });
    await expect(assetsService.dependencyOptions('officer', 'asset', '')).rejects.toMatchObject({ statusCode: 401 });
  });
  it('rejects missing or archived assets', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.findById).mockResolvedValue(null);
    await expect(assetsService.dependencyOptions('officer', 'asset', '')).rejects.toMatchObject({ statusCode: 404 });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ARCHIVED' } as never);
    await expect(assetsService.dependencyOptions('officer', 'asset', '')).rejects.toMatchObject({ statusCode: 409 });
  });
  it('returns options for an active asset to the officer', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    vi.mocked(assetsRepository.findById).mockResolvedValue({ status: 'ACTIVE' } as never);
    vi.mocked(assetsRepository.dependencyOptions).mockResolvedValue([]);
    expect(await assetsService.dependencyOptions('officer', 'asset', 'demo')).toEqual({ items: [] });
    expect(assetsRepository.dependencyOptions).toHaveBeenCalledWith('asset', 'demo');
  });
});
