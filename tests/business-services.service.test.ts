import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/it-asset-management/business-services.repository.js', () => ({
  businessServicesRepository: {
    findActor: vi.fn(),
    list: vi.fn(),
    findById: vi.fn(),
    listAssets: vi.fn(),
  },
}));
import { businessServicesRepository as repository } from '../src/modules/it-asset-management/business-services.repository.js';
import { businessServicesService as service } from '../src/modules/it-asset-management/business-services.service.js';
import { capabilitiesForRole } from '../src/modules/user-management-authorization/role-capabilities.js';

const id = '00000000-0000-4000-8000-000000000001';
const query = { page: 1, limit: 10 };
const record = {
  id,
  name: 'Customer Support',
  description: null,
  status: 'INACTIVE',
  created_at: new Date('2026-10-01T00:00:00Z'),
  updated_at: new Date('2026-10-02T00:00:00Z'),
  users: { id, full_name: 'Service Owner', status: 'INACTIVE' as const },
  _count: { assets: 2 },
};
describe('read-only business service catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(repository.findById).mockResolvedValue(record);
  });
  it('maps inactive service and owner without hiding historical links', async () => {
    vi.mocked(repository.list).mockResolvedValue([1, [record]]);
    const result = await service.list(id, { ...query, q: 'support' });
    expect(repository.list).toHaveBeenCalledWith({ ...query, q: 'support' });
    expect(result.items[0]).toMatchObject({
      status: 'inactive',
      linkedAssetsCount: 2,
      owner: { fullName: 'Service Owner', inactive: true },
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    expect(result.pagination).toEqual({ ...query, total: 1, totalPages: 1 });
    expect(await service.get(id, id)).toMatchObject({ status: 'inactive' });
  });
  it('keeps an unassigned owner null and bounds empty/out-of-range pages', async () => {
    vi.mocked(repository.findById).mockResolvedValue({ ...record, users: null });
    expect(await service.get(id, id)).toMatchObject({ owner: null });
    vi.mocked(repository.list).mockResolvedValue([0, []]);
    expect(await service.list(id, { page: 2, limit: 10 })).toMatchObject({
      items: [],
      pagination: { page: 2, totalPages: 0 },
    });
  });
  it.each(['ADMIN', 'EXECUTIVE', 'EMPLOYEE'] as const)(
    'does not expose the full catalog to %s through assets.read',
    async (role) => {
      vi.mocked(repository.findActor).mockResolvedValue({ role, status: 'ACTIVE' });
      await expect(service.list(id, query)).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.get(id, id)).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.listAssets(id, id, query)).rejects.toMatchObject({ statusCode: 403 });
      expect(repository.list).not.toHaveBeenCalled();
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.listAssets).not.toHaveBeenCalled();
      expect(capabilitiesForRole(role)).not.toContain('business-services.read');
    },
  );
  it('rejects a deactivated or missing actor', async () => {
    vi.mocked(repository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'INACTIVE',
    });
    await expect(service.list(id, query)).rejects.toMatchObject({ statusCode: 401 });
    vi.mocked(repository.findActor).mockResolvedValue(null);
    await expect(service.get(id, id)).rejects.toMatchObject({ statusCode: 401 });
  });
  it('returns 404 for missing service in detail and assets', async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);
    await expect(service.get(id, id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.listAssets(id, id, query)).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.listAssets).not.toHaveBeenCalled();
  });
  it('returns current linked assets including archived without mutating scope', async () => {
    vi.mocked(repository.listAssets).mockResolvedValue([
      1,
      [
        {
          id,
          asset_code: 'AST-1',
          name: 'Retired database',
          asset_type: 'DATABASE',
          status: 'ARCHIVED',
        },
      ],
    ]);
    expect(await service.listAssets(id, id, query)).toMatchObject({
      items: [{ assetCode: 'AST-1', status: 'archived' }],
      pagination: { total: 1 },
    });
    expect(repository.listAssets).toHaveBeenCalledWith(id, query);
    expect(capabilitiesForRole('SECURITY_OFFICER')).toContain('business-services.read');
  });
});
