import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';

const createPolicyDraftMock = vi.fn();

vi.mock('../src/database/prisma.js', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ value: 1 }]) },
}));

vi.mock('../src/modules/policy-compliance/policy-compliance.service.js', () => ({
  policyComplianceService: { createPolicyDraft: createPolicyDraftMock },
}));

function createAccessToken(permissions: string[]): string {
  return jwt.sign(
    { type: 'access', roles: ['SECURITY_OFFICER'], permissions },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000001',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );
}

describe('POST /api/v1/compliance/policies', () => {
  beforeEach(() => {
    createPolicyDraftMock.mockReset();
  });

  it('creates a policy draft for an authorized user', async () => {
    const createdAt = new Date('2026-09-06T10:00:00.000Z');
    createPolicyDraftMock.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000010',
      policyCode: 'ISP-001',
      title: 'Information Security Policy',
      description: null,
      ownerUserId: '00000000-0000-4000-8000-000000000001',
      status: 'draft',
      currentVersion: {
        id: '00000000-0000-4000-8000-000000000011',
        versionNumber: '1.0',
        content: 'Policy content',
        status: 'draft',
        createdAt,
      },
      createdAt,
      updatedAt: createdAt,
    });
    const { createApp } = await import('../src/app.js');

    const response = await request(createApp())
      .post('/api/v1/compliance/policies')
      .set('authorization', `Bearer ${createAccessToken(['policies.create'])}`)
      .send({
        policyCode: 'isp-001',
        title: 'Information Security Policy',
        content: 'Policy content',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.policyCode).toBe('ISP-001');
    expect(createPolicyDraftMock).toHaveBeenCalledWith(
      {
        policyCode: 'ISP-001',
        title: 'Information Security Policy',
        versionNumber: '1.0',
        content: 'Policy content',
      },
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it('rejects unauthenticated requests', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp())
      .post('/api/v1/compliance/policies')
      .send({ policyCode: 'ISP-001', title: 'Information Security Policy', content: 'Text' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(createPolicyDraftMock).not.toHaveBeenCalled();
  });

  it('rejects users without the required permission', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp())
      .post('/api/v1/compliance/policies')
      .set('authorization', `Bearer ${createAccessToken([])}`)
      .send({ policyCode: 'ISP-001', title: 'Information Security Policy', content: 'Text' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(createPolicyDraftMock).not.toHaveBeenCalled();
  });

  it('rejects invalid request bodies', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp())
      .post('/api/v1/compliance/policies')
      .set('authorization', `Bearer ${createAccessToken(['policies.create'])}`)
      .send({ policyCode: 'invalid code', title: 'x', content: '' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(createPolicyDraftMock).not.toHaveBeenCalled();
  });
});
