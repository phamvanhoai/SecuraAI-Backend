import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/policy-compliance-control/policy-compliance.service.js', () => ({
  policyComplianceService: { requestRevision: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const adminId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: adminId,
  expiresIn: '15m',
});
const app = createApp();

describe('POST policy revision request', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    const response = await request(app).post(
      `/api/v1/compliance/policies/${policyId}/versions/${versionId}/revision-requests`,
    );
    expect(response.status).toBe(401);
  });

  it('requests revision with a validated comment', async () => {
    vi.mocked(policyComplianceService.requestRevision).mockResolvedValue({
      policyId,
      policyCode: 'ISP-001',
      title: 'Security policy',
      description: null,
      ownerUserId: null,
      policyStatus: 'draft',
      updatedAt: new Date(),
      version: {
        id: versionId,
        versionNumber: '1.0',
        content: 'Required controls',
        changeSummary: null,
        status: 'draft',
        effectiveDate: null,
        createdByUserId: adminId,
        createdAt: new Date(),
      },
      decision: {
        id: '1ed854c0-c3d2-402e-abaf-c92bcdaf1b81',
        action: 'REVISION_REQUESTED',
        comment: 'Clarify the access scope.',
        actorUserId: adminId,
        decidedAt: new Date(),
      },
    });
    const response = await request(app)
      .post(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/revision-requests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: '  Clarify the access scope.  ' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      policyId,
      version: { status: 'draft' },
      decision: { action: 'REVISION_REQUESTED' },
    });
    expect(policyComplianceService.requestRevision).toHaveBeenCalledWith(
      adminId,
      policyId,
      versionId,
      { comment: 'Clarify the access scope.' },
    );
  });

  it('rejects a missing revision comment before the service', async () => {
    const response = await request(app)
      .post(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/revision-requests`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(422);
    expect(policyComplianceService.requestRevision).not.toHaveBeenCalled();
  });
});
