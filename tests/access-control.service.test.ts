import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listRoles: vi.fn(),
  findById: vi.fn(),
  findByCode: vi.fn(),
  countPermissions: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../src/modules/access-control/access-control.repository.js', () => ({
  accessControlRepository: mocks,
}));
import { accessControlService } from '../src/modules/access-control/access-control.service.js';

const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  permissions: ['roles.create', 'roles.read', 'roles.update', 'roles.delete'],
};
const role = (overrides: Record<string, unknown> = {}) => ({
  role_id: '00000000-0000-4000-8000-000000000010',
  code: 'RISK_REVIEWER',
  name: 'Risk Reviewer',
  description: null,
  is_system: false,
  created_at: new Date('2026-09-09T00:00:00Z'),
  updated_at: new Date('2026-09-09T00:00:00Z'),
  role_permissions: [],
  _count: { user_roles: 0, workflow_steps: 0 },
  ...overrides,
});

describe('accessControlService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (operation: (database: object) => Promise<unknown>) => operation({}),
    );
    mocks.countPermissions.mockResolvedValue(0);
    mocks.findByCode.mockResolvedValue(null);
    mocks.audit.mockResolvedValue({ audit_log_id: 'audit-1' });
  });
  it('lists system and custom roles with pagination', async () => {
    mocks.listRoles.mockResolvedValue({ items: [role({ is_system: true })], total: 1 });
    const result = await accessControlService.listRoles(
      { page: 1, limit: 20, sortBy: 'name', sortOrder: 'asc' },
      actor,
    );
    expect(result.items[0]?.isSystem).toBe(true);
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });
  it('returns system role details as read-only data', async () => {
    mocks.findById.mockResolvedValue(role({ is_system: true, code: 'ADMIN' }));
    await expect(accessControlService.getRole(role().role_id, actor)).resolves.toMatchObject({
      code: 'ADMIN',
      isSystem: true,
    });
  });
  it('creates a role and audit record atomically', async () => {
    mocks.create.mockResolvedValue(role());
    const result = await accessControlService.createRole(
      { code: 'RISK_REVIEWER', name: 'Risk Reviewer', permissionIds: [] },
      actor,
    );
    expect(result.code).toBe('RISK_REVIEWER');
    expect(mocks.audit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ action: 'role.created' }),
    );
  });
  it('blocks updates to system roles', async () => {
    mocks.findById.mockResolvedValue(role({ is_system: true }));
    await expect(
      accessControlService.updateRole(role().role_id, { name: 'Changed' }, actor),
    ).rejects.toMatchObject({ code: 'SYSTEM_ROLE_IMMUTABLE' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('blocks deleting assigned roles', async () => {
    mocks.findById.mockResolvedValue(role({ _count: { user_roles: 1, workflow_steps: 0 } }));
    await expect(accessControlService.deleteRole(role().role_id, actor)).rejects.toMatchObject({
      code: 'ROLE_IN_USE',
    });
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it('requires the operation permission in the service layer', async () => {
    await expect(
      accessControlService.listRoles(
        { page: 1, limit: 20, sortBy: 'name', sortOrder: 'asc' },
        { userId: actor.userId, permissions: [] },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
