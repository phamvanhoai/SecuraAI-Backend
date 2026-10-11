import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    createPolicyDraft: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'cc641a6e-6c63-4cf0-b626-34307fb36a88';
const versionId = 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8';
const input = {
  policyCode: 'ISP-001',
  title: 'Information security policy',
  description: 'Initial policy',
  versionNumber: '1.0',
  content: 'Policy content',
};

describe('create policy draft service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a V2 policy and its first draft version for an active Security Officer', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(policyComplianceRepository.createPolicyDraft).mockResolvedValue({
      policy: {
        id: policyId,
        policy_code: input.policyCode,
        title: input.title,
        description: input.description,
        owner_user_id: userId,
        status: 'DRAFT',
        created_at: new Date('2026-09-30T00:00:00Z'),
        updated_at: new Date('2026-09-30T00:00:00Z'),
      },
      version: {
        id: versionId,
        version_number: input.versionNumber,
        content: input.content,
        status: 'DRAFT',
        created_at: new Date('2026-09-30T00:00:00Z'),
      },
    });

    await expect(policyComplianceService.createPolicyDraft(userId, input)).resolves.toMatchObject({
      id: policyId,
      policyCode: 'ISP-001',
      ownerUserId: userId,
      status: 'DRAFT',
      currentVersion: { id: versionId, versionNumber: '1.0', status: 'DRAFT' },
    });
    expect(policyComplianceRepository.createPolicyDraft).toHaveBeenCalledWith(userId, input);
  });

  it('rejects non-Security-Officer roles', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    await expect(policyComplianceService.createPolicyDraft(userId, input)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('maps a duplicate policy code to a domain conflict', async () => {
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(policyComplianceRepository.createPolicyDraft).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(policyComplianceService.createPolicyDraft(userId, input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'POLICY_CODE_EXISTS',
    });
  });
});
