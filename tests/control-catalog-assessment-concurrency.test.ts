import { beforeEach, describe, expect, it, vi } from 'vitest';
const { tx } = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    users: { findUnique: vi.fn() },
    security_controls: { findUnique: vi.fn(), update: vi.fn() },
    audit_logs: { create: vi.fn() },
    control_assessments: { create: vi.fn() },
  },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
  },
}));
import { controlEffectivenessRepository } from '../src/modules/policy-compliance-control/control-effectiveness.repository.js';
const actor = '00000000-0000-4000-8000-000000000001';
const controlId = '00000000-0000-4000-8000-000000000002';
const configuration = {
  applicability: 'APPLICABLE' as const,
  implementation_status: 'IMPLEMENTED' as const,
};
const input = {
  testMethod: 'Verify MFA enforcement',
  result: 'effective' as const,
  effectiveness: 100,
  notes: 'All tested administrative accounts require MFA.',
};
beforeEach(() => {
  vi.clearAllMocks();
  tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
  tx.security_controls.findUnique.mockResolvedValue({
    ...configuration,
    owner_user_id: actor,
    control_evidence_links: [
      {
        evidence_items: {
          id: controlId,
          collected_at: new Date('2026-01-01'),
          valid_from: null,
          valid_until: null,
        },
      },
    ],
  });
  tx.control_assessments.create.mockResolvedValue({ id: controlId, assessed_at: new Date() });
});
describe('Assessment versus catalog Edit safety', () => {
  it('updates implementation and records before/after with the new assessment in one transaction', async () => {
    await controlEffectivenessRepository.create(
      controlId,
      actor,
      {
        ...input,
        expectedImplementationStatus: 'implemented',
        implementationStatus: 'partially_implemented',
        implementationChangeReason: 'Deployment coverage reduced after infrastructure changes.',
      },
      configuration,
    );
    expect(tx.security_controls.update).toHaveBeenCalledWith({
      where: { id: controlId },
      data: { implementation_status: 'PARTIALLY_IMPLEMENTED' },
    });
    expect(tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CONTROL_IMPLEMENTATION_ASSESSED',
          actor_user_id: actor,
          before_data: { implementationStatus: 'IMPLEMENTED' },
          after_data: expect.objectContaining({
            implementationStatus: 'PARTIALLY_IMPLEMENTED',
            assessmentId: controlId,
            reason: 'Deployment coverage reduced after infrastructure changes.',
          }),
        }),
      }),
    );
    expect(tx.security_controls.update.mock.invocationCallOrder[0]).toBeLessThan(
      tx.control_assessments.create.mock.invocationCallOrder[0] ?? Infinity,
    );
  });
  it('does not write an audit when assessment persistence fails', async () => {
    // No status change is requested: an assessment failure must not write an audit.
    tx.control_assessments.create.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      controlEffectivenessRepository.create(controlId, actor, input, configuration),
    ).rejects.toThrow('write failed');
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it.each(['ADMIN', 'EXECUTIVE'])(
    'does not allow %s to change implementation even if listed as owner',
    async (role) => {
      tx.users.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
      await expect(
        controlEffectivenessRepository.create(controlId, actor, input, configuration),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(tx.security_controls.update).not.toHaveBeenCalled();
      expect(tx.control_assessments.create).not.toHaveBeenCalled();
    },
  );
  it('requires a reason for implementation changes and rejects stale form baselines', async () => {
    await expect(
      controlEffectivenessRepository.create(
        controlId,
        actor,
        { ...input, expectedImplementationStatus: 'implemented', implementationStatus: 'planned' },
        configuration,
      ),
    ).rejects.toMatchObject({ code: 'IMPLEMENTATION_REASON_REQUIRED' });
    await expect(
      controlEffectivenessRepository.create(
        controlId,
        actor,
        { ...input, expectedImplementationStatus: 'planned', implementationStatus: 'planned' },
        configuration,
      ),
    ).rejects.toMatchObject({ code: 'CONTROL_STALE' });
    expect(tx.security_controls.update).not.toHaveBeenCalled();
    expect(tx.control_assessments.create).not.toHaveBeenCalled();
  });
  it('allows an assigned owner to move a Planned Control into partial deployment with a fresh assessment', async () => {
    tx.security_controls.findUnique.mockResolvedValue({
      ...configuration,
      implementation_status: 'PLANNED',
      owner_user_id: actor,
      control_evidence_links: [
        {
          evidence_items: {
            collected_at: new Date('2026-01-01'),
            valid_from: null,
            valid_until: null,
          },
        },
      ],
    });
    await controlEffectivenessRepository.create(
      controlId,
      actor,
      {
        ...input,
        implementationStatus: 'partially_implemented',
        expectedImplementationStatus: 'planned',
        implementationChangeReason:
          'The appointment access restriction is deployed for part of the scope.',
      },
      { ...configuration, implementation_status: 'PLANNED' },
    );
    expect(tx.security_controls.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { implementation_status: 'PARTIALLY_IMPLEMENTED' } }),
    );
    expect(tx.control_assessments.create).toHaveBeenCalledOnce();
  });
  it('does not count an Active but expired evidence item towards a new assessment', async () => {
    tx.security_controls.findUnique.mockResolvedValue({
      ...configuration,
      owner_user_id: actor,
      control_evidence_links: [
        {
          evidence_items: {
            collected_at: new Date('2020-01-01'),
            valid_from: null,
            valid_until: new Date('2020-01-02'),
          },
        },
      ],
    });
    await expect(
      controlEffectivenessRepository.create(controlId, actor, input, configuration),
    ).rejects.toMatchObject({ code: 'CONTROL_EVIDENCE_REQUIRED' });
    expect(tx.control_assessments.create).not.toHaveBeenCalled();
  });
  it('rechecks owner and configuration under the same Control row lock before appending', async () => {
    await controlEffectivenessRepository.create(controlId, actor, input, configuration);
    expect(tx.$queryRaw.mock.calls.some((call) => call[0].join('').includes('FOR UPDATE'))).toBe(
      true,
    );
    expect(tx.control_assessments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          control_id: controlId,
          assessed_by: actor,
          effectiveness: 100,
        }),
      }),
    );
  });
  it('rejects a reassigned owner without creating an assessment', async () => {
    tx.security_controls.findUnique.mockResolvedValue({
      ...configuration,
      owner_user_id: controlId,
      control_evidence_links: [{}],
    });
    await expect(
      controlEffectivenessRepository.create(controlId, actor, input, configuration),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.control_assessments.create).not.toHaveBeenCalled();
  });
  it('rejects a changed implementation instead of saving a result against stale configuration', async () => {
    tx.security_controls.findUnique.mockResolvedValue({
      ...configuration,
      implementation_status: 'PLANNED',
      owner_user_id: actor,
      control_evidence_links: [{}],
    });
    await expect(
      controlEffectivenessRepository.create(controlId, actor, input, configuration),
    ).rejects.toMatchObject({ code: 'CONTROL_STALE' });
    expect(tx.control_assessments.create).not.toHaveBeenCalled();
  });
  it('rejects deactivated actors and evidence removed since the service read', async () => {
    tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'INACTIVE' });
    await expect(
      controlEffectivenessRepository.create(controlId, actor, input, configuration),
    ).rejects.toMatchObject({ statusCode: 401 });
    tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    tx.security_controls.findUnique.mockResolvedValue({
      ...configuration,
      owner_user_id: actor,
      control_evidence_links: [],
    });
    await expect(
      controlEffectivenessRepository.create(controlId, actor, input, configuration),
    ).rejects.toMatchObject({ code: 'CONTROL_EVIDENCE_REQUIRED' });
    expect(tx.control_assessments.create).not.toHaveBeenCalled();
  });
});
