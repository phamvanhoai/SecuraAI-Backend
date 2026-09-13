import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updatePolicyAndCreateVersionMock } = vi.hoisted(() => ({
  updatePolicyAndCreateVersionMock: vi.fn(),
}));

vi.mock('../src/modules/policy-compliance/policy-compliance.service.js', () => ({
  policyComplianceService: {
    updatePolicyAndCreateVersion: updatePolicyAndCreateVersionMock,
  },
}));

import { createApp } from '../src/app.js';

const policyId = '00000000-0000-4000-8000-000000000010';
const accessToken = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: ['SECURITY_OFFICER'], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000001',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );

describe('POST update policy and create new version endpoint', () => {
  beforeEach(() => {
    updatePolicyAndCreateVersionMock.mockReset();
    updatePolicyAndCreateVersionMock.mockResolvedValue({
      policyId,
      policyStatus: 'draft',
      version: { versionNumber: '1.1', status: 'draft' },
    });
  });

  it('creates a new draft version with policies.update', async () => {
    const response = await request(createApp())
      .post(`/api/v1/compliance/policies/${policyId}/versions`)
      .set('authorization', `Bearer ${accessToken(['policies.update'])}`)
      .send({
        versionNumber: '1.1',
        content: 'Updated content',
        changeSummary: 'Updated access controls',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: { policyStatus: 'draft', version: { status: 'draft' } },
    });
  });

  it('rejects callers without policies.update before the service', async () => {
    const response = await request(createApp())
      .post(`/api/v1/compliance/policies/${policyId}/versions`)
      .set('authorization', `Bearer ${accessToken(['policies.publish'])}`)
      .send({
        versionNumber: '1.1',
        content: 'Updated content',
        changeSummary: 'Updated access controls',
      });

    expect(response.status).toBe(403);
    expect(updatePolicyAndCreateVersionMock).not.toHaveBeenCalled();
  });

  it('validates IDs and required version fields', async () => {
    const response = await request(createApp())
      .post('/api/v1/compliance/policies/bad/versions')
      .set('authorization', `Bearer ${accessToken(['policies.update'])}`)
      .send({ versionNumber: '1.1', content: '' });

    expect(response.status).toBe(422);
    expect(updatePolicyAndCreateVersionMock).not.toHaveBeenCalled();
  });
});
