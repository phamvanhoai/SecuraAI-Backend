import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/audit-security-reporting/audit-logs.repository.js', () => ({
  auditLogsRepository: {
    findActorUser: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
  },
}));

import { auditLogsRepository } from '../src/modules/audit-security-reporting/audit-logs.repository.js';
import { auditLogsService } from '../src/modules/audit-security-reporting/audit-logs.service.js';

const adminUserId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const sampleAuditId = 'f249f96c-7a87-47e2-a6fd-2bebc29294c5';

const mockAuditRecord = {
  id: sampleAuditId,
  actor_type: 'USER' as const,
  actor_user_id: adminUserId,
  actor_api_key_id: null,
  action: 'UPDATE_ROLE',
  resource_type: 'roles',
  resource_id: 'ec178d52-2959-47fd-93db-aa693158668c',
  occurred_at: new Date('2026-10-08T10:00:00.000Z'),
  before_data: { role: 'EMPLOYEE' },
  after_data: { role: 'SECURITY_OFFICER' },
  correlation_id: 'corr-12345',
  source: 'web-ui',
  source_ip: '192.168.1.50',
  user_agent: 'Mozilla/5.0',
  previous_hash: 'prevhash123',
  record_hash: 'rechash456',
  created_at: new Date('2026-10-08T10:00:00.000Z'),
  users: {
    id: adminUserId,
    full_name: 'Admin User',
    email: 'admin@securaai.internal',
    role: 'ADMIN' as const,
  },
  integration_api_keys: null,
};

describe('audit logs service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auditLogsRepository.findActorUser).mockResolvedValue({
      id: adminUserId,
      full_name: 'Admin User',
      email: 'admin@securaai.internal',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(auditLogsRepository.findMany).mockResolvedValue([mockAuditRecord]);
    vi.mocked(auditLogsRepository.count).mockResolvedValue(1);
  });

  describe('listAuditLogs', () => {
    it('returns paginated and mapped audit logs for admin', async () => {
      const result = await auditLogsService.listAuditLogs(adminUserId, {
        page: 1,
        limit: 20,
        sortBy: 'occurredAt',
        sortOrder: 'desc',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: sampleAuditId,
        action: 'UPDATE_ROLE',
        actorType: 'USER',
        actor: {
          id: adminUserId,
          name: 'Admin User',
          email: 'admin@securaai.internal',
        },
        resourceType: 'roles',
        occurredAt: '2026-10-08T10:00:00.000Z',
      });
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 1,
        totalPages: 1,
      });
    });

    it('passes search and filter parameters to repository', async () => {
      const query = {
        page: 1,
        limit: 10,
        search: 'role change',
        actor: 'Admin',
        actorType: 'USER' as const,
        action: 'UPDATE_ROLE',
        resourceType: 'roles',
        correlationId: 'corr-12345',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-08T23:59:59.000Z',
        sortBy: 'action' as const,
        sortOrder: 'asc' as const,
      };

      const result = await auditLogsService.listAuditLogs(adminUserId, query);

      expect(auditLogsRepository.findMany).toHaveBeenCalledWith(query);
      expect(auditLogsRepository.count).toHaveBeenCalledWith(query);
      expect(result.items).toHaveLength(1);
    });

    it('allows a security officer to view audit logs', async () => {
      vi.mocked(auditLogsRepository.findActorUser).mockResolvedValue({
        id: adminUserId,
        full_name: 'Security Officer',
        email: 'officer@securaai.internal',
        role: 'SECURITY_OFFICER',
        status: 'ACTIVE',
      });

      const result = await auditLogsService.listAuditLogs(adminUserId, {
        page: 1,
        limit: 20,
        sortBy: 'occurredAt',
        sortOrder: 'desc',
      });

      expect(result.items).toHaveLength(1);
    });

    it('rejects an executive actor without direct audit log access', async () => {
      vi.mocked(auditLogsRepository.findActorUser).mockResolvedValue({
        id: adminUserId,
        full_name: 'Executive Leader',
        email: 'executive@securaai.internal',
        role: 'EXECUTIVE',
        status: 'ACTIVE',
      });

      await expect(
        auditLogsService.listAuditLogs(adminUserId, {
          page: 1,
          limit: 20,
          sortBy: 'occurredAt',
          sortOrder: 'desc',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(auditLogsRepository.findMany).not.toHaveBeenCalled();
    });

    it('rejects an employee actor without audit permissions', async () => {
      vi.mocked(auditLogsRepository.findActorUser).mockResolvedValue({
        id: adminUserId,
        full_name: 'Regular Employee',
        email: 'employee@securaai.internal',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      });

      await expect(
        auditLogsService.listAuditLogs(adminUserId, {
          page: 1,
          limit: 20,
          sortBy: 'occurredAt',
          sortOrder: 'desc',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(auditLogsRepository.findMany).not.toHaveBeenCalled();
    });

    it('rejects an inactive or locked user session', async () => {
      vi.mocked(auditLogsRepository.findActorUser).mockResolvedValue({
        id: adminUserId,
        full_name: 'Locked Admin',
        email: 'locked@securaai.internal',
        role: 'ADMIN',
        status: 'LOCKED',
      });

      await expect(
        auditLogsService.listAuditLogs(adminUserId, {
          page: 1,
          limit: 20,
          sortBy: 'occurredAt',
          sortOrder: 'desc',
        }),
      ).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  describe('getAuditLogDetail', () => {
    beforeEach(() => {
      vi.mocked(auditLogsRepository.findById).mockResolvedValue(mockAuditRecord);
    });

    it('returns audit log detail for admin or security officer', async () => {
      const result = await auditLogsService.getAuditLogDetail(adminUserId, sampleAuditId);

      expect(auditLogsRepository.findById).toHaveBeenCalledWith(sampleAuditId);
      expect(result.id).toBe(sampleAuditId);
      expect(result.action).toBe('UPDATE_ROLE');
      expect(result.actor?.name).toBe('Admin User');
      expect(result.beforeData).toEqual({ role: 'EMPLOYEE' });
      expect(result.afterData).toEqual({ role: 'SECURITY_OFFICER' });
    });

    it('throws 404 when audit record does not exist', async () => {
      vi.mocked(auditLogsRepository.findById).mockResolvedValue(null);

      await expect(
        auditLogsService.getAuditLogDetail(adminUserId, '00000000-0000-0000-0000-000000000000'),
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('rejects an executive actor with 403', async () => {
      vi.mocked(auditLogsRepository.findActorUser).mockResolvedValue({
        id: adminUserId,
        full_name: 'Executive Leader',
        email: 'executive@securaai.internal',
        role: 'EXECUTIVE',
        status: 'ACTIVE',
      });

      await expect(
        auditLogsService.getAuditLogDetail(adminUserId, sampleAuditId),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });
});
