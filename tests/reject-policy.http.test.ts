import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/policy-compliance-control/policy-compliance.service.js', () => ({
  policyComplianceService: { rejectPolicy: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const reason = 'Required publication controls are incomplete.';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256', issuer: 'securaai-api', audience: 'securaai-client',
  subject: adminId, expiresIn: '15m',
});
const app = createApp();

describe('POST policy rejection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes a validated rejection reason to the service', async () => {
    vi.mocked(policyComplianceService.rejectPolicy).mockResolvedValue({} as never);
    const response = await request(app)
      .post(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason });
    expect(response.status).toBe(200);
    expect(policyComplianceService.rejectPolicy).toHaveBeenCalledWith(
      adminId, policyId, versionId, { reason },
    );
  });

  it('rejects a missing reason before the service', async () => {
    const response = await request(app)
      .post(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(422);
    expect(policyComplianceService.rejectPolicy).not.toHaveBeenCalled();
  });
});
