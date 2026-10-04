import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { normalizedEventsRepository } from '../src/modules/event-ingestion/normalized-events.repository.js';
import { normalizedEventsService } from '../src/modules/event-ingestion/normalized-events.service.js';

describe('normalizedEventsService', () => {
  it('lists normalized events with mapped user and asset formatting', async () => {
    const mockEvents = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        event_source_id: 'src-001',
        ingestion_batch_id: 'batch-001',
        external_event_id: 'ext-001',
        event_family: 'AUTHENTICATION' as const,
        event_type: 'USER_LOGON',
        schema_version: '1.0',
        occurred_at: new Date('2026-03-30T10:00:00Z'),
        ingested_at: new Date('2026-03-30T10:00:01Z'),
        account_identifier: 'johndoe',
        source_ip: '192.168.1.50',
        destination_ip: '10.0.0.1',
        device_identifier: 'SRV-DC01',
        severity: 'LOW',
        mapping_status: 'MAPPED' as const,
        created_at: new Date('2026-03-30T10:00:01Z'),
        event_sources: {
          id: 'src-001',
          name: 'Wazuh Production',
          source_type: 'WAZUH',
        },
        event_entity_mappings: [
          {
            assets: {
              id: 'asset-001',
              name: 'Domain Controller 01',
              asset_code: 'AST-SRV-01',
              asset_type: 'SERVER',
              criticality: 'CRITICAL',
            },
            users_event_entity_mappings_user_idTousers: {
              id: 'user-001',
              email: 'john.doe@company.com',
              full_name: 'John Doe',
            },
          },
        ],
        _count: {
          anomaly_detections: 1,
        },
      },
    ];

    vi.spyOn(normalizedEventsRepository, 'findEvents').mockResolvedValue({
      items: mockEvents,
      total: 1,
    });

    const result = await normalizedEventsService.listEvents('user-admin-1', {
      page: 1,
      limit: 20,
      sortBy: 'occurredAt',
      sortOrder: 'desc',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(result.items[0]?.eventSourceName).toBe('Wazuh Production');
    expect(result.items[0]?.mappedUser?.email).toBe('john.doe@company.com');
    expect(result.items[0]?.mappedAsset?.assetCode).toBe('AST-SRV-01');
    expect(result.items[0]?.anomalyCount).toBe(1);
    expect(result.pagination.total).toBe(1);
  });

  it('throws 404 when normalized event is not found', async () => {
    vi.spyOn(normalizedEventsRepository, 'findById').mockResolvedValue(null);

    await expect(
      normalizedEventsService.getEventDetail('user-admin-1', '550e8400-e29b-41d4-a716-446655440099'),
    ).rejects.toThrow('Normalized security event not found');
  });

  it('returns event detail with payload and anomaly detections', async () => {
    const mockDetail = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      event_source_id: 'src-001',
      ingestion_batch_id: 'batch-001',
      external_event_id: 'ext-002',
      event_family: 'VPN_SSO' as const,
      event_type: 'VPN_CONNECT',
      schema_version: '1.0',
      occurred_at: new Date('2026-03-30T11:00:00Z'),
      ingested_at: new Date('2026-03-30T11:00:01Z'),
      account_identifier: 'alice',
      source_ip: '203.0.113.195',
      destination_ip: '10.0.0.2',
      device_identifier: 'VPN-GW01',
      severity: 'MEDIUM',
      mapping_status: 'UNMAPPED' as const,
      normalized_payload: { raw_event: 'VPN Connection Established' },
      created_at: new Date('2026-03-30T11:00:01Z'),
      event_sources: {
        id: 'src-001',
        name: 'Wazuh Production',
        source_type: 'WAZUH',
      },
      event_entity_mappings: [],
      anomaly_detections: [
        {
          id: 'anom-001',
          anomaly_score: new Prisma.Decimal(0.85),
          threshold: new Prisma.Decimal(0.75),
          is_anomaly: true,
          detected_at: new Date('2026-03-30T11:05:00Z'),
        },
      ],
      _count: {
        anomaly_detections: 1,
      },
    };

    vi.spyOn(normalizedEventsRepository, 'findById').mockResolvedValue(mockDetail);

    const result = await normalizedEventsService.getEventDetail('user-admin-1', '550e8400-e29b-41d4-a716-446655440002');

    expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440002');
    expect(result.normalizedPayload).toEqual({ raw_event: 'VPN Connection Established' });
    expect(result.anomalyDetections).toHaveLength(1);
    expect(result.anomalyDetections?.[0]?.anomalyScore).toBe(0.85);
  });

  it('returns overview metrics', async () => {
    vi.spyOn(normalizedEventsRepository, 'getMetrics').mockResolvedValue({
      totalEvents: 1500,
      totalMapped: 1200,
      totalUnmapped: 300,
      eventsLast24Hours: 250,
      byFamily: {
        AUTHENTICATION: 800,
        VPN_SSO: 500,
        APPLICATION_ACCESS: 200,
      },
    });

    const metrics = await normalizedEventsService.getMetrics('user-admin-1');

    expect(metrics.totalEvents).toBe(1500);
    expect(metrics.byFamily.AUTHENTICATION).toBe(800);
  });

  it('updates event entity mapping successfully', async () => {
    const mockUpdatedMapping = {
      id: 'map-002',
      event_id: '550e8400-e29b-41d4-a716-446655440001',
      user_id: '550e8400-e29b-41d4-a716-446655440010',
      monitored_account_id: null,
      asset_id: '550e8400-e29b-41d4-a716-446655440020',
      mapping_method: 'MANUAL' as const,
      confidence: new Prisma.Decimal(1.0),
      reason: 'Manual correction by Security Officer',
      mapped_by: 'user-admin-1',
      mapped_at: new Date('2026-10-03T10:00:00Z'),
      is_active: true,
      supersedes_mapping_id: 'map-001',
      created_at: new Date('2026-10-03T10:00:00Z'),
      assets: {
        id: '550e8400-e29b-41d4-a716-446655440020',
        name: 'Database Server',
        asset_code: 'AST-DB-01',
        asset_type: 'DATABASE',
        criticality: 'HIGH',
      },
      users_event_entity_mappings_user_idTousers: {
        id: '550e8400-e29b-41d4-a716-446655440010',
        email: 'analyst@company.com',
        full_name: 'Security Analyst',
      },
      users_event_entity_mappings_mapped_byTousers: {
        id: 'user-admin-1',
        email: 'admin@company.com',
        full_name: 'Admin User',
      },
      monitored_accounts: null,
    };

    vi.spyOn(normalizedEventsRepository, 'updateMapping').mockResolvedValue(mockUpdatedMapping);

    const result = await normalizedEventsService.updateEventMapping(
      'user-admin-1',
      '550e8400-e29b-41d4-a716-446655440001',
      {
        userId: '550e8400-e29b-41d4-a716-446655440010',
        assetId: '550e8400-e29b-41d4-a716-446655440020',
        reason: 'Manual correction by Security Officer',
        confidence: 1.0,
      },
    );

    expect(result.id).toBe('map-002');
    expect(result.mappingMethod).toBe('MANUAL');
    expect(result.mappedUser?.email).toBe('analyst@company.com');
    expect(result.mappedAsset?.assetCode).toBe('AST-DB-01');
    expect(result.mappedBy?.email).toBe('admin@company.com');
  });

  it('throws 404 when updating mapping for non-existent event', async () => {
    vi.spyOn(normalizedEventsRepository, 'updateMapping').mockResolvedValue(null);

    await expect(
      normalizedEventsService.updateEventMapping(
        'user-admin-1',
        '550e8400-e29b-41d4-a716-446655440099',
        {
          userId: '550e8400-e29b-41d4-a716-446655440010',
          reason: 'Test reason',
          confidence: 1.0,
        },
      ),
    ).rejects.toThrow('Normalized security event not found');
  });

  it('returns mapping options for users and assets', async () => {
    vi.spyOn(normalizedEventsRepository, 'getMappingOptions').mockResolvedValue({
      users: [{ id: 'u1', email: 'user@test.com', full_name: 'User Test' }],
      assets: [
        {
          id: 'a1',
          name: 'Server 1',
          asset_code: 'AST-01',
          asset_type: 'SERVER',
          criticality: 'HIGH',
        },
      ],
      monitoredAccounts: [],
    });

    const options = await normalizedEventsService.getMappingOptions('user-admin-1');

    expect(options.users).toHaveLength(1);
    expect(options.assets).toHaveLength(1);
  });
});
