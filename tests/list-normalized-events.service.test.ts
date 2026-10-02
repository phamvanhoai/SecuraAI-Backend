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
});
