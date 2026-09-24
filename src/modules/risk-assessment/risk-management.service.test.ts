import { afterEach, describe, expect, it, vi } from 'vitest';
import { riskManagementRepository } from './risk-management.repository.js';
import { riskManagementService } from './risk-management.service.js';
import { Prisma } from '@prisma/client';

const input = {
  riskAssessmentId: '00000000-0000-4000-8000-000000000001',
  expectedRiskUpdatedAt: '2026-09-21T01:00:00.000Z',
  strategy: 'mitigate' as const,
  description: 'Reduce unauthorized access to the service.',
  ownerUserId: '00000000-0000-4000-8000-000000000002',
  targetDate: '2026-10-31',
  actions: [
    {
      title: 'Enable multi-factor authentication',
      assignedToUserId: '00000000-0000-4000-8000-000000000003',
      dueDate: '2026-10-15',
    },
  ],
};
const context = { ipAddress: null, userAgent: null };

afterEach(() => vi.restoreAllMocks());

describe('riskManagementService.createTreatmentPlan', () => {
  it('requires the create permission before accessing the repository', async () => {
    const repository = vi.spyOn(riskManagementRepository, 'createTreatmentPlan');
    await expect(
      riskManagementService.createTreatmentPlan(
        input,
        { userId: 'actor', permissions: [], roles: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(repository).not.toHaveBeenCalled();
  });

  it('returns a conflict when the risk already has an active plan', async () => {
    vi.spyOn(riskManagementRepository, 'createTreatmentPlan').mockResolvedValue({
      failure: 'PLAN_ALREADY_EXISTS',
      plan: null,
    });
    await expect(
      riskManagementService.createTreatmentPlan(
        input,
        {
          userId: '00000000-0000-4000-8000-000000000004',
          permissions: ['risk-treatment-plans.create'],
          roles: ['SECURITY_OFFICER'],
        },
        context,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'TREATMENT_PLAN_ALREADY_EXISTS',
    });
  });
});

describe('riskManagementService.updateTreatmentPlan', () => {
  const updateInput = {
    expectedUpdatedAt: '2026-09-21T01:00:00.000Z',
    strategy: 'mitigate' as const,
    description: 'Reduce unauthorized access to the service.',
    ownerUserId: '00000000-0000-4000-8000-000000000002',
    targetDate: '2026-10-31',
    actions: [
      {
        id: '00000000-0000-4000-8000-000000000005',
        title: 'Enable multi-factor authentication',
        assignedToUserId: '00000000-0000-4000-8000-000000000003',
        dueDate: '2026-10-15',
      },
    ],
  };

  it('requires update permission before accessing the repository', async () => {
    const repository = vi.spyOn(riskManagementRepository, 'updateTreatmentPlan');
    await expect(
      riskManagementService.updateTreatmentPlan(
        '00000000-0000-4000-8000-000000000006',
        updateInput,
        { userId: 'actor', permissions: [], roles: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(repository).not.toHaveBeenCalled();
  });

  it.each([
    ['RISK_NOT_EDITABLE', 409, 'RISK_ASSESSMENT_NOT_EDITABLE'],
    ['RISK_TARGET_INVALID', 422, 'RISK_TARGET_INVALID'],
    ['ACTION_ALREADY_STARTED', 409, 'TREATMENT_ACTION_ALREADY_STARTED'],
  ] as const)('maps %s to a business error', async (failure, statusCode, code) => {
    vi.spyOn(riskManagementRepository, 'updateTreatmentPlan').mockResolvedValue({
      failure,
      plan: null,
    });
    await expect(
      riskManagementService.updateTreatmentPlan(
        '00000000-0000-4000-8000-000000000006',
        updateInput,
        {
          userId: '00000000-0000-4000-8000-000000000004',
          permissions: ['risk-treatment-plans.update'],
          roles: ['SECURITY_OFFICER'],
        },
        context,
      ),
    ).rejects.toMatchObject({ statusCode, code });
  });

});

describe('riskManagementService.cancelTreatmentPlan', () => {
  const cancelInput = {
    expectedUpdatedAt: '2026-09-21T01:00:00.000Z',
    reason: 'This plan was created for the wrong assessment.',
  };

  it('requires cancel permission before accessing the repository', async () => {
    const repository = vi.spyOn(riskManagementRepository, 'cancelTreatmentPlan');
    await expect(
      riskManagementService.cancelTreatmentPlan(
        '00000000-0000-4000-8000-000000000006',
        cancelInput,
        { userId: 'actor', permissions: [], roles: [] },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(repository).not.toHaveBeenCalled();
  });

  it.each([
    ['PLAN_NOT_CANCELLABLE', 'TREATMENT_PLAN_NOT_CANCELLABLE'],
    ['RISK_NOT_CANCELLABLE', 'RISK_ASSESSMENT_NOT_CANCELLABLE'],
    ['PLAN_CHANGED', 'TREATMENT_PLAN_CHANGED'],
    ['ACTION_ALREADY_STARTED', 'TREATMENT_ACTION_ALREADY_STARTED'],
  ] as const)('maps %s to a conflict', async (failure, code) => {
    vi.spyOn(riskManagementRepository, 'cancelTreatmentPlan').mockResolvedValue({
      failure,
      plan: null,
    });
    await expect(
      riskManagementService.cancelTreatmentPlan(
        '00000000-0000-4000-8000-000000000006',
        cancelInput,
        {
          userId: '00000000-0000-4000-8000-000000000004',
          permissions: ['risk-treatment-plans.cancel'],
          roles: ['SECURITY_OFFICER'],
        },
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code });
  });

  it.each([
    ['P2034', 409, 'TREATMENT_PLAN_CANCEL_CONFLICT'],
    ['P2028', 503, 'TREATMENT_PLAN_CANCEL_TEMPORARILY_UNAVAILABLE'],
  ] as const)('maps concurrent transaction error %s safely', async (prismaCode, statusCode, code) => {
    vi.spyOn(riskManagementRepository, 'cancelTreatmentPlan').mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Concurrent cancellation', {
        code: prismaCode,
        clientVersion: '6.12.0',
      }),
    );
    await expect(
      riskManagementService.cancelTreatmentPlan(
        '00000000-0000-4000-8000-000000000006',
        cancelInput,
        {
          userId: '00000000-0000-4000-8000-000000000004',
          permissions: ['risk-treatment-plans.cancel'],
          roles: ['SECURITY_OFFICER'],
        },
        context,
      ),
    ).rejects.toMatchObject({ statusCode, code });
  });
});
