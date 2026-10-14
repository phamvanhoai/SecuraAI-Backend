import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/policy-compliance-control/policy-compliance.service.js', () => ({
  policyComplianceService: { createPolicyDraft: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});
const app = createApp();

describe('create policy draft HTTP route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a policy draft', async () => {
    vi.mocked(policyComplianceService.createPolicyDraft).mockResolvedValue({} as never);
    const response = await request(app)
      .post('/api/v1/compliance/policies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        policyCode: 'isp-001',
        title: 'Information security policy',
        versionNumber: '1.0',
        content: 'Policy content',
      });
    expect(response.status).toBe(201);
    expect(policyComplianceService.createPolicyDraft).toHaveBeenCalledWith(userId, {
      policyCode: 'ISP-001',
      title: 'Information security policy',
      versionNumber: '1.0',
      content: 'Policy content',
    });
  });

  it('requires authentication', async () => {
    expect((await request(app).post('/api/v1/compliance/policies').send({})).status).toBe(401);
  });

  it('rejects invalid input', async () => {
    const response = await request(app)
      .post('/api/v1/compliance/policies')
      .set('Authorization', `Bearer ${token}`)
      .send({ policyCode: 'bad code', title: 'x', versionNumber: '', content: '' });
    expect(response.status).toBe(422);
    expect(policyComplianceService.createPolicyDraft).not.toHaveBeenCalled();
  });
});
