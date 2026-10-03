import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/policy-compliance-control/policy-compliance.service.js', () => ({
  policyComplianceService: { getApplicability: vi.fn(), defineApplicability: vi.fn() },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'f249f96c-7a87-47e2-a6fd-2bebc29294c5';
const versionId = 'ec178d52-2959-47fd-93db-aa693158668c';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});
const app = createApp();

describe('policy applicability HTTP routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads applicability and options', async () => {
    vi.mocked(policyComplianceService.getApplicability).mockResolvedValue({} as never);
    const response = await request(app)
      .get(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/applicability`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(policyComplianceService.getApplicability).toHaveBeenCalledWith(
      userId,
      policyId,
      versionId,
    );
  });

  it('defines applicability', async () => {
    vi.mocked(policyComplianceService.defineApplicability).mockResolvedValue({} as never);
    const body = {
      roleCodes: ['EMPLOYEE'],
      rationale: 'All employees process information governed by this policy.',
      referenceBasis: 'ISO/IEC 27001',
    };
    const response = await request(app)
      .put(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/applicability`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(response.status).toBe(200);
    expect(policyComplianceService.defineApplicability).toHaveBeenCalledWith(
      userId,
      policyId,
      versionId,
      expect.objectContaining({ roleCodes: ['EMPLOYEE'] }),
    );
  });

  it('rejects an empty scope', async () => {
    const response = await request(app)
      .put(`/api/v1/compliance/policies/${policyId}/versions/${versionId}/applicability`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rationale: 'This rationale is sufficiently long for validation.',
        referenceBasis: 'ISO/IEC 27001',
      });
    expect(response.status).toBe(422);
    expect(policyComplianceService.defineApplicability).not.toHaveBeenCalled();
  });
});
