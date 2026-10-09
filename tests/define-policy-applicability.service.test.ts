import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/policy-compliance-control/policy-compliance.repository.js', () => ({
  policyComplianceRepository: {
    findActor: vi.fn(),
    findOwnedDraftApplicability: vi.fn(),
    listActiveDepartments: vi.fn(),
    countActiveDepartments: vi.fn(),
    upsertApplicability: vi.fn(),
  },
}));

import { policyComplianceRepository } from '../src/modules/policy-compliance-control/policy-compliance.repository.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const policyId = 'f249f96c-7a87-47e2-a6fd-2bebc29294c5';
const versionId = 'ec178d52-2959-47fd-93db-aa693158668c';
const departmentId = '773d8356-e68c-421b-9ce3-29ea4601970f';
const draft = {
  id: versionId,
  policy_id: policyId,
  status: 'DRAFT' as const,
  author_user_id: userId,
  policies_policy_versions_policy_idTopolicies: {
    owner_user_id: userId,
    policy_code: 'POL-1',
    title: 'Access policy',
  },
  policy_applicabilities: null,
};
const input = {
  departmentIds: [departmentId],
  roleCodes: ['EMPLOYEE' as const],
  userGroups: [],
  organizationalScope: null,
  rationale: 'All employees in the selected department process covered data.',
  referenceBasis: 'ISO/IEC 27001 organizational controls',
};
const savedApplicability = {
  id: '2eb99033-321b-4b20-8800-b9da25ff491b',
  policy_version_id: versionId,
  department_ids: [departmentId],
  role_codes: ['EMPLOYEE' as const],
  user_groups: [],
  organizational_scope: null,
  rationale: input.rationale,
  reference_basis: input.referenceBasis,
  defined_by: userId,
  defined_at: new Date(),
  updated_at: new Date(),
};

describe('define policy applicability service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyComplianceRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'SECURITY_OFFICER',
    });
    vi.mocked(policyComplianceRepository.findOwnedDraftApplicability).mockResolvedValue(draft);
    vi.mocked(policyComplianceRepository.listActiveDepartments).mockResolvedValue([
      { id: departmentId, code: 'IT', name: 'Information Technology' },
    ]);
    vi.mocked(policyComplianceRepository.countActiveDepartments).mockResolvedValue(1);
    vi.mocked(policyComplianceRepository.upsertApplicability).mockResolvedValue({
      ...savedApplicability,
      users: { id: userId, full_name: 'Officer' },
    });
  });

  it('validates departments and saves applicability for an owned draft', async () => {
    vi.mocked(policyComplianceRepository.findOwnedDraftApplicability)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, policy_applicabilities: savedApplicability });
    const result = await policyComplianceService.defineApplicability(
      userId,
      policyId,
      versionId,
      input,
    );
    expect(policyComplianceRepository.upsertApplicability).toHaveBeenCalledWith(
      versionId,
      userId,
      input,
    );
    expect(result.applicability?.departmentIds).toEqual([departmentId]);
  });

  it('rejects inactive or unknown departments', async () => {
    vi.mocked(policyComplianceRepository.countActiveDepartments).mockResolvedValue(0);
    await expect(
      policyComplianceService.defineApplicability(userId, policyId, versionId, input),
    ).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_DEPARTMENTS' });
  });
});
