import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/event-ingestion/event-governance.repository.js', () => ({
  eventGovernanceRepository: {
    findActorUser: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    findAllActive: vi.fn(),
  },
}));

import { eventGovernanceRepository } from '../src/modules/event-ingestion/event-governance.repository.js';
import { eventGovernanceService } from '../src/modules/event-ingestion/event-governance.service.js';

const adminUserId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const samplePolicyId = '7d191192-3490-410a-ba53-3a72d3f92d44';

const mockPolicyRecord = {
  id: samplePolicyId,
  name: 'Authentication Event Retention Policy',
  purpose: 'Retain authentication records for 90 days for compliance monitoring and anomaly detection',
  event_family: 'AUTHENTICATION' as const,
  retention_days: 90,
  access_scope: 'SECURITY_OPERATIONS',
  masking_rules: { maskIp: true, maskAccount: false },
  export_allowed: true,
  archive_after_days: 30,
  deletion_enabled: true,
  status: 'ACTIVE' as const,
  created_at: new Date('2026-10-01T08:00:00.000Z'),
  updated_at: new Date('2026-10-01T08:00:00.000Z'),
  created_by: adminUserId,
  updated_by: adminUserId,
  creator: {
    id: adminUserId,
    full_name: 'Admin User',
    email: 'admin@securaai.internal',
  },
  updater: {
    id: adminUserId,
    full_name: 'Admin User',
    email: 'admin@securaai.internal',
  },
};

describe('event governance service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eventGovernanceRepository.findActorUser).mockResolvedValue({
      id: adminUserId,
      full_name: 'Admin User',
      email: 'admin@securaai.internal',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(eventGovernanceRepository.findMany).mockResolvedValue([mockPolicyRecord]);
    vi.mocked(eventGovernanceRepository.count).mockResolvedValue(1);
    vi.mocked(eventGovernanceRepository.findById).mockResolvedValue(mockPolicyRecord);
    vi.mocked(eventGovernanceRepository.findAllActive).mockResolvedValue([
      {
        id: samplePolicyId,
        retention_days: 90,
        archive_after_days: 30,
        deletion_enabled: true,
        export_allowed: true,
        status: 'ACTIVE',
      },
    ]);
  });

  describe('listPolicies', () => {
    it('returns paginated policies for administrator', async () => {
      const result = await eventGovernanceService.listPolicies(adminUserId, {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: samplePolicyId,
        name: 'Authentication Event Retention Policy',
        eventFamily: 'AUTHENTICATION',
        retentionDays: 90,
        archiveAfterDays: 30,
        deletionEnabled: true,
        exportAllowed: true,
        status: 'ACTIVE',
        createdBy: {
          id: adminUserId,
          name: 'Admin User',
          email: 'admin@securaai.internal',
        },
      });
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 1,
        totalPages: 1,
      });
    });

    it('allows Security Officer role', async () => {
      vi.mocked(eventGovernanceRepository.findActorUser).mockResolvedValue({
        id: adminUserId,
        full_name: 'Security Officer',
        email: 'officer@securaai.internal',
        role: 'SECURITY_OFFICER',
        status: 'ACTIVE',
      });

      const result = await eventGovernanceService.listPolicies(adminUserId, {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result.items).toHaveLength(1);
    });

    it('rejects Executive role with 403', async () => {
      vi.mocked(eventGovernanceRepository.findActorUser).mockResolvedValue({
        id: adminUserId,
        full_name: 'Executive Leader',
        email: 'exec@securaai.internal',
        role: 'EXECUTIVE',
        status: 'ACTIVE',
      });

      await expect(
        eventGovernanceService.listPolicies(adminUserId, {
          page: 1,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('rejects Employee role with 403', async () => {
      vi.mocked(eventGovernanceRepository.findActorUser).mockResolvedValue({
        id: adminUserId,
        full_name: 'Regular Employee',
        email: 'employee@securaai.internal',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      });

      await expect(
        eventGovernanceService.listPolicies(adminUserId, {
          page: 1,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('getPolicyDetail', () => {
    it('returns detailed policy configuration', async () => {
      const result = await eventGovernanceService.getPolicyDetail(adminUserId, samplePolicyId);

      expect(eventGovernanceRepository.findById).toHaveBeenCalledWith(samplePolicyId);
      expect(result.id).toBe(samplePolicyId);
      expect(result.name).toBe('Authentication Event Retention Policy');
      expect(result.retentionDays).toBe(90);
      expect(result.archiveAfterDays).toBe(30);
      expect(result.deletionEnabled).toBe(true);
    });

    it('throws 404 when policy not found', async () => {
      vi.mocked(eventGovernanceRepository.findById).mockResolvedValue(null);

      await expect(
        eventGovernanceService.getPolicyDetail(adminUserId, '00000000-0000-0000-0000-000000000000'),
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('getLifecycleSummary', () => {
    it('computes retention and archival lifecycle metrics across active policies', async () => {
      const result = await eventGovernanceService.getLifecycleSummary(adminUserId);

      expect(result).toEqual({
        totalPolicies: 1,
        activePolicies: 1,
        inactivePolicies: 0,
        minRetentionDays: 90,
        maxRetentionDays: 90,
        avgRetentionDays: 90,
        policiesWithArchival: 1,
        policiesWithAutomatedDeletion: 1,
        exportAllowedCount: 1,
      });
    });
  });
});
