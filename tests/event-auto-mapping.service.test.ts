import { describe, expect, it } from 'vitest';
import {
  eventAutoMappingService,
  type AutoMappingCandidates,
} from '../src/modules/event-ingestion/event-auto-mapping.service.js';

describe('eventAutoMappingService', () => {
  const mockCandidates: AutoMappingCandidates = {
    users: [
      {
        id: 'user-uuid-1',
        email: 'alice@company.com',
        fullName: 'Alice Smith',
      },
      {
        id: 'user-uuid-2',
        email: 'bob.security@company.com',
        fullName: 'Bob Security',
      },
      {
        id: 'user-uuid-3',
        email: 'admin@company.com',
        fullName: 'System Administrator',
      },
    ],
    monitoredAccounts: [
      {
        id: 'monitored-uuid-1',
        accountIdentifier: 'svc-backup',
        displayName: 'Backup Service Account',
        linkedUserId: null,
        assetId: null,
      },
    ],
    assets: [
      {
        id: 'asset-uuid-1',
        name: 'Corporate VPN Gateway',
        assetCode: 'DEMO-AST-VPN01',
        assetType: 'NETWORK_DEVICE',
        criticality: 'HIGH',
      },
      {
        id: 'asset-uuid-2',
        name: 'Customer Database Server',
        assetCode: 'DEMO-AST-DB01',
        assetType: 'DATABASE',
        criticality: 'CRITICAL',
      },
    ],
  };

  it('maps both User and Asset when both match exactly -> MAPPED', async () => {
    const events = [
      {
        id: 'event-1',
        accountIdentifier: 'alice@company.com',
        deviceIdentifier: 'DEMO-AST-VPN01',
      },
    ];

    const result = await eventAutoMappingService.resolveAutoMappings(events, mockCandidates);

    expect(result.mappingStatusMap.get('event-1')).toBe('MAPPED');
    expect(result.mappingsToCreate).toHaveLength(2);

    const userMapping = result.mappingsToCreate.find((m) => m.user_id === 'user-uuid-1');
    expect(userMapping).toBeDefined();
    expect(userMapping?.mapping_method).toBe('AUTO');
    expect(Number(userMapping?.confidence)).toBe(1.0);
    expect(userMapping?.mapped_by).toBeNull();
    expect(userMapping?.is_active).toBe(true);

    const assetMapping = result.mappingsToCreate.find((m) => m.asset_id === 'asset-uuid-1');
    expect(assetMapping).toBeDefined();
    expect(assetMapping?.mapping_method).toBe('AUTO');
    expect(Number(assetMapping?.confidence)).toBe(0.95);
    expect(assetMapping?.mapped_by).toBeNull();
  });

  it('maps only User when asset is unknown -> PARTIALLY_MAPPED', async () => {
    const events = [
      {
        id: 'event-2',
        accountIdentifier: 'alice@company.com',
        deviceIdentifier: 'unknown-workstation-99',
      },
    ];

    const result = await eventAutoMappingService.resolveAutoMappings(events, mockCandidates);

    expect(result.mappingStatusMap.get('event-2')).toBe('PARTIALLY_MAPPED');
    expect(result.mappingsToCreate).toHaveLength(1);
    expect(result.mappingsToCreate[0]?.user_id).toBe('user-uuid-1');
    expect(result.mappingsToCreate[0]?.asset_id).toBeNull();
  });

  it('maps only Asset when account is unknown -> PARTIALLY_MAPPED', async () => {
    const events = [
      {
        id: 'event-3',
        accountIdentifier: 'unknown.user',
        deviceIdentifier: 'DEMO-AST-DB01',
      },
    ];

    const result = await eventAutoMappingService.resolveAutoMappings(events, mockCandidates);

    expect(result.mappingStatusMap.get('event-3')).toBe('PARTIALLY_MAPPED');
    expect(result.mappingsToCreate).toHaveLength(1);
    expect(result.mappingsToCreate[0]?.asset_id).toBe('asset-uuid-2');
    expect(result.mappingsToCreate[0]?.user_id).toBeNull();
  });

  it('maps Monitored Account when identifier matches -> PARTIALLY_MAPPED', async () => {
    const events = [
      {
        id: 'event-4',
        accountIdentifier: 'svc-backup',
        deviceIdentifier: 'unknown-device',
      },
    ];

    const result = await eventAutoMappingService.resolveAutoMappings(events, mockCandidates);

    expect(result.mappingStatusMap.get('event-4')).toBe('PARTIALLY_MAPPED');
    expect(result.mappingsToCreate).toHaveLength(1);
    expect(result.mappingsToCreate[0]?.monitored_account_id).toBe('monitored-uuid-1');
    expect(Number(result.mappingsToCreate[0]?.confidence)).toBe(0.95);
  });

  it('matches user by email prefix (e.g. "admin" -> "admin@company.com")', async () => {
    const events = [
      {
        id: 'event-5',
        accountIdentifier: 'admin',
        deviceIdentifier: 'unknown-host',
      },
    ];

    const result = await eventAutoMappingService.resolveAutoMappings(events, mockCandidates);

    expect(result.mappingStatusMap.get('event-5')).toBe('PARTIALLY_MAPPED');
    expect(result.mappingsToCreate).toHaveLength(1);
    expect(result.mappingsToCreate[0]?.user_id).toBe('user-uuid-3');
    expect(Number(result.mappingsToCreate[0]?.confidence)).toBe(0.9);
  });

  it('matches asset by exact name or substring in deviceIdentifier', async () => {
    const events = [
      {
        id: 'event-6a',
        accountIdentifier: null,
        deviceIdentifier: 'Customer Database Server',
      },
      {
        id: 'event-6b',
        accountIdentifier: null,
        deviceIdentifier: 'agent-DEMO-AST-VPN01-corp',
      },
    ];

    const result = await eventAutoMappingService.resolveAutoMappings(events, mockCandidates);

    expect(result.mappingStatusMap.get('event-6a')).toBe('PARTIALLY_MAPPED');
    const mapping6a = result.mappingsToCreate.find((m) => m.event_id === 'event-6a');
    expect(mapping6a?.asset_id).toBe('asset-uuid-2');
    expect(Number(mapping6a?.confidence)).toBe(0.9);

    expect(result.mappingStatusMap.get('event-6b')).toBe('PARTIALLY_MAPPED');
    const mapping6b = result.mappingsToCreate.find((m) => m.event_id === 'event-6b');
    expect(mapping6b?.asset_id).toBe('asset-uuid-1');
    expect(Number(mapping6b?.confidence)).toBe(0.85);
  });

  it('leaves event UNMAPPED with 0 mappings when nothing matches', async () => {
    const events = [
      {
        id: 'event-7',
        accountIdentifier: 'hacker@darkweb.org',
        deviceIdentifier: 'foreign-box-1234',
      },
    ];

    const result = await eventAutoMappingService.resolveAutoMappings(events, mockCandidates);

    expect(result.mappingStatusMap.get('event-7')).toBe('UNMAPPED');
    expect(result.mappingsToCreate).toHaveLength(0);
  });

  it('returns empty result when events list is empty', async () => {
    const result = await eventAutoMappingService.resolveAutoMappings([], mockCandidates);

    expect(result.mappingStatusMap.size).toBe(0);
    expect(result.mappingsToCreate).toHaveLength(0);
  });
});
