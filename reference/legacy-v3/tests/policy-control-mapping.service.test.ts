import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findPublishedVersion: vi.fn(),
  findFramework: vi.fn(),
  countFrameworkControls: vi.fn(),
  listExistingFrameworkMappings: vi.fn(),
  replaceFrameworkMappings: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock('../src/modules/policy-compliance/policy-control-mapping.repository.js', () => ({
  policyControlMappingRepository: mocks,
}));

import { policyControlMappingService } from '../src/modules/policy-compliance/policy-control-mapping.service.js';

const policyId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const frameworkId = '00000000-0000-4000-8000-000000000003';
const controlId = '00000000-0000-4000-8000-000000000004';
const actor = { userId: 'user-1', permissions: ['compliance.map-controls'] };

describe('policy control mapping service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback: (database: object) => unknown) => callback({}));
    mocks.findPublishedVersion.mockResolvedValue({
      policy_version_id: versionId,
      policies: { policy_code: 'ISP-001' },
    });
    mocks.countFrameworkControls.mockResolvedValue(1);
    mocks.findFramework.mockResolvedValue({ compliance_framework_id: frameworkId });
    mocks.listExistingFrameworkMappings.mockResolvedValue([]);
  });

  it('requires the mapping permission in the service layer', async () => {
    await expect(
      policyControlMappingService.replace(
        policyId,
        versionId,
        frameworkId,
        { mappings: [] },
        { ...actor, permissions: [] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects controls outside the selected framework', async () => {
    mocks.countFrameworkControls.mockResolvedValue(0);
    await expect(
      policyControlMappingService.replace(
        policyId,
        versionId,
        frameworkId,
        { mappings: [{ controlId }] },
        actor,
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_FRAMEWORK_CONTROLS' });
  });

  it('replaces one framework mapping and writes an audit record', async () => {
    await expect(
      policyControlMappingService.replace(
        policyId,
        versionId,
        frameworkId,
        { mappings: [{ controlId, notes: 'Supports access control' }] },
        actor,
        { ipAddress: '127.0.0.1', userAgent: 'test' },
      ),
    ).resolves.toMatchObject({ policyId, versionId, frameworkId });
    expect(mocks.replaceFrameworkMappings).toHaveBeenCalledWith({}, versionId, frameworkId, [
      { controlId, notes: 'Supports access control' },
    ]);
    expect(mocks.createAudit).toHaveBeenCalledOnce();
  });
});
