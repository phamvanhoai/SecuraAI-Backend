import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publishVersionMock = vi.hoisted(() => vi.fn());

vi.mock('../src/modules/policy-compliance/policy-compliance.service.js', () => ({
  policyComplianceService: { publishVersion: publishVersionMock },
}));

import { createApp } from '../src/app.js';

const policyId = '00000000-0000-4000-8000-000000000010';
const versionId = '00000000-0000-4000-8000-000000000011';
const accessToken = (permissions: string[]): string =>
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

describe('POST policy version publish endpoint', () => {
  beforeEach(() => {
    publishVersionMock.mockReset();
    publishVersionMock.mockResolvedValue({ policyId, status: 'published' });
  });

  it('publishes for a caller with policies.publish', async () => {
    const response = await request(createApp())
      .post(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/publish`)
      .set('authorization', `Bearer ${accessToken(['policies.publish'])}`)
      .send({ effectiveDate: '2026-09-09' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'published' } });
  });

  it('rejects missing permission before the service', async () => {
    const response = await request(createApp())
      .post(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/publish`)
      .set('authorization', `Bearer ${accessToken([])}`)
      .send({});
    expect(response.status).toBe(403);
    expect(publishVersionMock).not.toHaveBeenCalled();
  });

  it('rejects invalid parameters and dates', async () => {
    const response = await request(createApp())
      .post('/api/v1/compliance/policies/bad/versions/bad/publish')
      .set('authorization', `Bearer ${accessToken(['policies.publish'])}`)
      .send({ effectiveDate: '2026-02-30' });
    expect(response.status).toBe(422);
    expect(publishVersionMock).not.toHaveBeenCalled();
  });
});
