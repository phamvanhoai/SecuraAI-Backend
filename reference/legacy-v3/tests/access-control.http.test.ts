import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPermissions: vi.fn(),
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
import { createApp } from '../src/app.js';

const token = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: ['ADMIN'], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000001',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );
const record = {
  role_id: '00000000-0000-4000-8000-000000000010',
  code: 'RISK_REVIEWER',
  name: 'Risk Reviewer',
  description: null,
  is_system: false,
  created_at: new Date('2026-09-09T00:00:00Z'),
  updated_at: new Date('2026-09-09T00:00:00Z'),
  role_permissions: [],
  _count: { user_roles: 0, workflow_steps: 0 },
};

describe('custom role HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (operation: (database: object) => Promise<unknown>) => operation({}),
    );
    mocks.listRoles.mockResolvedValue({ items: [record], total: 1 });
    mocks.listPermissions.mockResolvedValue({
      items: [
        {
          permission_id: '00000000-0000-4000-8000-000000000020',
          code: 'roles.read',
          module: 'access-control',
          action: 'read',
          description: null,
        },
      ],
      total: 1,
    });
    mocks.findByCode.mockResolvedValue(null);
    mocks.countPermissions.mockResolvedValue(0);
    mocks.create.mockResolvedValue(record);
    mocks.audit.mockResolvedValue({ audit_log_id: 'audit-1' });
  });
  it('protects and returns the paginated permission catalog', async () => {
    expect((await request(createApp()).get('/api/v1/access-control/permissions')).status).toBe(401);
    const forbidden = await request(createApp())
      .get('/api/v1/access-control/permissions')
      .set('authorization', `Bearer ${token([])}`);
    const response = await request(createApp())
      .get('/api/v1/access-control/permissions?module=access-control')
      .set('authorization', `Bearer ${token(['roles.read'])}`);
    expect(forbidden.status).toBe(403);
    expect(response.status).toBe(200);
    expect(response.body.data.items[0]).toMatchObject({ code: 'roles.read' });
  });
  it('requires authentication and roles.read', async () => {
    expect((await request(createApp()).get('/api/v1/access-control/roles')).status).toBe(401);
    expect(
      (
        await request(createApp())
          .get('/api/v1/access-control/roles')
          .set('authorization', `Bearer ${token([])}`)
      ).status,
    ).toBe(403);
  });
  it('returns a paginated custom-role list', async () => {
    const response = await request(createApp())
      .get('/api/v1/access-control/roles?page=1&limit=10')
      .set('authorization', `Bearer ${token(['roles.read'])}`);
    expect(response.status).toBe(200);
    expect(response.body.data.items[0]).toMatchObject({ code: 'RISK_REVIEWER', isSystem: false });
  });
  it('creates a valid custom role and rejects invalid codes', async () => {
    const authorization = `Bearer ${token(['roles.create'])}`;
    const created = await request(createApp())
      .post('/api/v1/access-control/roles')
      .set('authorization', authorization)
      .send({ code: 'RISK_REVIEWER', name: 'Risk Reviewer', permissionIds: [] });
    const invalid = await request(createApp())
      .post('/api/v1/access-control/roles')
      .set('authorization', authorization)
      .send({ code: 'bad role', name: 'Bad Role' });
    expect(created.status).toBe(201);
    expect(invalid.status).toBe(422);
  });
});
