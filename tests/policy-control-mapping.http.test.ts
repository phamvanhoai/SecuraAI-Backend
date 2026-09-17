import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  listFrameworks: vi.fn(),
  listFrameworkControls: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('../src/modules/policy-compliance/policy-control-mapping.service.js', () => ({
  policyControlMappingService: mocks,
}));

import { createApp } from '../src/app.js';

const policyId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const frameworkId = '00000000-0000-4000-8000-000000000003';
const controlId = '00000000-0000-4000-8000-000000000004';
const token = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: ['SECURITY_OFFICER'], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000005',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );

describe('policy control mapping endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    mocks.replace.mockResolvedValue({ policyId, versionId, frameworkId, mappings: [] });
  });

  it('lists mappings with compliance.map-controls', async () => {
    const response = await request(createApp())
      .get('/api/v1/compliance/policy-control-mappings')
      .set('authorization', `Bearer ${token(['compliance.map-controls'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { items: [] } });
  });

  it('rejects a caller without the mapping permission', async () => {
    const response = await request(createApp())
      .get('/api/v1/compliance/policy-control-mappings')
      .set('authorization', `Bearer ${token(['policies.update'])}`);
    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('validates and replaces mappings', async () => {
    const response = await request(createApp())
      .put(
        `/api/v1/compliance/policies/${policyId}/versions/${versionId}/frameworks/${frameworkId}/control-mappings`,
      )
      .set('authorization', `Bearer ${token(['compliance.map-controls'])}`)
      .send({ mappings: [{ controlId, notes: 'Mapped requirement' }] });
    expect(response.status).toBe(200);
    expect(mocks.replace).toHaveBeenCalledWith(
      policyId,
      versionId,
      frameworkId,
      { mappings: [{ controlId, notes: 'Mapped requirement' }] },
      expect.objectContaining({ userId: expect.any(String) }),
      expect.objectContaining({ ipAddress: expect.anything() }),
    );
  });
});
