import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findPublishedPolicy: vi.fn(),
  countActiveDepartments: vi.fn(),
  replacePolicyDepartments: vi.fn(),
  createPolicyDepartmentsAudit: vi.fn(),
  listPolicyDepartmentAssignments: vi.fn(),
}));

vi.mock('../src/modules/policy-compliance/policy-compliance.repository.js', () => ({
  policyComplianceRepository: mocks,
}));

import { policyComplianceService } from '../src/modules/policy-compliance/policy-compliance.service.js';

const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  permissions: ['policies.assign-department'],
};
const policyId = '00000000-0000-4000-8000-000000000010';
const departmentId = '00000000-0000-4000-8000-000000000020';

describe('policyComplianceService policy department assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (operation: (database: object) => Promise<unknown>) => operation({}),
    );
    mocks.findPublishedPolicy.mockResolvedValue({
      policy_id: policyId,
      policy_code: 'ISP-001',
      policy_departments: [],
    });
    mocks.countActiveDepartments.mockResolvedValue(1);
  });

  it('checks the assignment permission rather than the role name', async () => {
    await expect(
      policyComplianceService.assignPolicyDepartments(
        policyId,
        { departmentIds: [] },
        { ...actor, permissions: [] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('replaces assignments and writes an audit record', async () => {
    await expect(
      policyComplianceService.assignPolicyDepartments(
        policyId,
        { departmentIds: [departmentId] },
        actor,
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      ),
    ).resolves.toEqual({
      policyId,
      policyCode: 'ISP-001',
      departmentIds: [departmentId],
    });
    expect(mocks.replacePolicyDepartments).toHaveBeenCalledWith(
      expect.anything(),
      policyId,
      [departmentId],
      actor.userId,
    );
    expect(mocks.createPolicyDepartmentsAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ policyId, afterDepartmentIds: [departmentId] }),
    );
  });

  it('rejects inactive or missing departments', async () => {
    mocks.countActiveDepartments.mockResolvedValue(0);

    await expect(
      policyComplianceService.assignPolicyDepartments(
        policyId,
        { departmentIds: [departmentId] },
        actor,
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_DEPARTMENTS' });
    expect(mocks.replacePolicyDepartments).not.toHaveBeenCalled();
  });
});
