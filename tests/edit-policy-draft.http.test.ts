import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/policy-compliance-control/policy-compliance.service.js', () => ({
  policyComplianceService: { editOwnDraft: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'f249f96c-7a87-47e2-a6fd-2bebc29294c5';
const versionId = 'ec178d52-2959-47fd-93db-aa693158668c';
const app = createApp();
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

describe('PATCH /api/v1/compliance/policies/:policyId/drafts/:versionId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    const response = await request(app).patch(
      `/api/v1/compliance/policies/${policyId}/drafts/${versionId}`,
    );
    expect(response.status).toBe(401);
  });

  it('validates and updates the policy draft', async () => {
    vi.mocked(policyComplianceService.editOwnDraft).mockResolvedValue({
      policyId,
      policyCode: 'TEST',
      title: 'Updated policy',
      description: null,
      ownerUserId: userId,
      policyStatus: 'DRAFT',
      version: {
        id: versionId,
        versionNumber: '1.1',
        content: 'Updated content',
        changeSummary: 'Revised scope',
        status: 'DRAFT',
        createdByUserId: userId,
        createdAt: new Date('2026-09-25T01:00:00Z'),
      },
      createdAt: new Date('2026-09-25T00:00:00Z'),
      updatedAt: new Date('2026-09-26T01:00:00Z'),
    });

    const response = await request(app)
      .patch(`/api/v1/compliance/policies/${policyId}/drafts/${versionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: ' Updated policy ', versionNumber: '1.1', content: 'Updated content' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      policyId,
      title: 'Updated policy',
      version: { id: versionId, versionNumber: '1.1' },
    });
    expect(policyComplianceService.editOwnDraft).toHaveBeenCalledWith(
      userId,
      policyId,
      versionId,
      { title: 'Updated policy', versionNumber: '1.1', content: 'Updated content' },
    );
  });

  it('rejects an empty body before calling the service', async () => {
    const response = await request(app)
      .patch(`/api/v1/compliance/policies/${policyId}/drafts/${versionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(422);
    expect(policyComplianceService.editOwnDraft).not.toHaveBeenCalled();
  });
});
