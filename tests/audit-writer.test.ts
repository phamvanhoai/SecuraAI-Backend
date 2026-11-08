import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { requestContextStorage } from '../src/common/middleware/request-context.js';

const mockPrisma = vi.hoisted(() => ({
  audit_logs: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: mockPrisma,
}));

import { auditWriter } from '../src/modules/audit-security-reporting/audit-writer.js';

describe('auditWriter service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('automatically resolves sourceIp, userAgent, and correlationId from active RequestContext', async () => {
    mockPrisma.audit_logs.findFirst.mockResolvedValue({
      record_hash: 'prev_hash_abc_123',
    });
    mockPrisma.audit_logs.create.mockImplementation(({ data }) => Promise.resolve({ id: 'log-1', ...data }));

    await requestContextStorage.run(
      {
        sourceIp: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        correlationId: 'req-uuid-999',
      },
      async () => {
        await auditWriter.record({
          actorUserId: '11111111-1111-1111-1111-111111111111',
          action: 'USER_LOGGED_OUT',
          resourceType: 'USER',
          resourceId: '11111111-1111-1111-1111-111111111111',
        });
      },
    );

    expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor_user_id: '11111111-1111-1111-1111-111111111111',
          actor_type: 'USER',
          action: 'USER_LOGGED_OUT',
          resource_type: 'USER',
          source: 'API',
          source_ip: '127.0.0.1',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0)',
          correlation_id: 'req-uuid-999',
          previous_hash: 'prev_hash_abc_123',
          record_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it('allows explicit overrides for sourceIp, userAgent, and actorType', async () => {
    mockPrisma.audit_logs.findFirst.mockResolvedValue(null);
    mockPrisma.audit_logs.create.mockImplementation(({ data }) => Promise.resolve({ id: 'log-2', ...data }));

    await auditWriter.record({
      actorApiKeyId: '22222222-2222-2222-2222-222222222222',
      action: 'INGEST_NORMALIZED_EVENT',
      resourceType: 'EVENT_SOURCE',
      sourceIp: '::ffff:192.168.1.100',
      userAgent: 'Wazuh-Forwarder/4.0',
      source: 'INGESTION',
      outcome: 'SUCCESS',
    });

    expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor_api_key_id: '22222222-2222-2222-2222-222222222222',
          actor_type: 'API_KEY',
          action: 'INGEST_NORMALIZED_EVENT',
          resource_type: 'EVENT_SOURCE',
          source: 'INGESTION',
          source_ip: '192.168.1.100',
          user_agent: 'Wazuh-Forwarder/4.0',
          record_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it('executes inside an existing Prisma transaction client when provided', async () => {
    const mockTx = {
      audit_logs: {
        findFirst: vi.fn().mockResolvedValue({ record_hash: 'tx_prev_hash' }),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'log-tx', ...data })),
      },
    } as unknown as Prisma.TransactionClient;

    await auditWriter.record(
      {
        action: 'SYSTEM_MAINTENANCE_TRIGGERED',
        resourceType: 'SYSTEM',
      },
      mockTx,
    );

    expect(mockTx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor_type: 'SYSTEM',
          action: 'SYSTEM_MAINTENANCE_TRIGGERED',
          previous_hash: 'tx_prev_hash',
          record_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(mockPrisma.audit_logs.create).not.toHaveBeenCalled();
  });
});

