import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({ prisma: { users: mocks } }));
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';
import { assetOwnerOptionsQuerySchema } from '../src/modules/it-asset-management/dto/asset-owner-options.dto.js';
import { responsibilityWhere } from '../src/modules/user-management-authorization/business-responsibilities.js';
beforeEach(() => { vi.resetAllMocks(); vi.setSystemTime(new Date('2026-10-29T00:00:00Z')); });
it('bounds search and rejects forged query fields', () => {
  expect(assetOwnerOptionsQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  expect(assetOwnerOptionsQuerySchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
});
it('searches active users by name/email and returns only minimal identifying data', async () => {
  mocks.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  mocks.findMany.mockResolvedValue([{ id: 'user', full_name: 'Same Name', email: 'second@example.test' }]);
  expect(await assetsService.ownerOptions('officer', 'second@')).toEqual({ items: [{ id: 'user', fullName: 'Same Name', email: 'second@example.test' }] });
  expect(mocks.findMany).toHaveBeenCalledWith({ where: { AND: [responsibilityWhere('ASSET_OWNER', false)], OR: [
    { full_name: { contains: 'second@', mode: 'insensitive' } }, { email: { contains: 'second@', mode: 'insensitive' } },
  ] }, select: { id: true, full_name: true, email: true }, orderBy: [{ full_name: 'asc' }, { id: 'asc' }], take: 10 });
});
it.each(['EMPLOYEE', 'ADMIN', 'EXECUTIVE'])('rejects non-officer %s', async (role) => {
  mocks.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
  await expect(assetsService.ownerOptions('actor', '')).rejects.toMatchObject({ statusCode: 403 });
  expect(mocks.findMany).not.toHaveBeenCalled();
});
it('rejects inactive actors', async () => {
  mocks.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
  await expect(assetsService.ownerOptions('actor', '')).rejects.toMatchObject({ statusCode: 401 });
});
