import { Prisma } from '@prisma/client';
import {
  eventAutoMappingRepository,
  type CandidateUser,
  type CandidateMonitoredAccount,
  type CandidateAsset,
} from './event-auto-mapping.repository.js';

export interface EventForAutoMapping {
  id: string;
  accountIdentifier?: string | null | undefined;
  deviceIdentifier?: string | null | undefined;
  sourceIp?: string | null | undefined;
  destinationIp?: string | null | undefined;
}

export interface EntityMappingEntry {
  event_id: string;
  user_id: string | null;
  asset_id: string | null;
  monitored_account_id: string | null;
  mapping_method: 'AUTO';
  confidence: Prisma.Decimal;
  reason: string;
  mapped_by: null;
  is_active: true;
  mapped_at: Date;
}

export interface AutoMappingCandidates {
  users: CandidateUser[];
  monitoredAccounts: CandidateMonitoredAccount[];
  assets: CandidateAsset[];
}

export interface AutoMappingBatchResult {
  mappingStatusMap: Map<string, 'MAPPED' | 'PARTIALLY_MAPPED' | 'UNMAPPED'>;
  mappingsToCreate: EntityMappingEntry[];
}

export const eventAutoMappingService = {
  async resolveAutoMappings(
    events: EventForAutoMapping[],
    injectedCandidates?: AutoMappingCandidates,
  ): Promise<AutoMappingBatchResult> {
    const mappingStatusMap = new Map<string, 'MAPPED' | 'PARTIALLY_MAPPED' | 'UNMAPPED'>();
    const mappingsToCreate: EntityMappingEntry[] = [];

    if (!events.length) {
      return { mappingStatusMap, mappingsToCreate };
    }

    const candidates = injectedCandidates ?? (await eventAutoMappingRepository.findCandidates());
    const now = new Date();

    for (const event of events) {
      const rawAccount = event.accountIdentifier?.trim() ?? '';
      const rawDevice = event.deviceIdentifier?.trim() ?? '';

      let matchedUser: { id: string; confidence: number; reason: string } | null = null;
      let matchedMonitoredAccount: { id: string; confidence: number; reason: string } | null = null;
      let matchedAsset: { id: string; confidence: number; reason: string } | null = null;

      // 1. Match User / Account
      if (rawAccount) {
        const accountLower = rawAccount.toLowerCase();

        // Exact email match
        const exactEmailUser = candidates.users.find(
          (u) => u.email.toLowerCase() === accountLower,
        );
        if (exactEmailUser) {
          matchedUser = {
            id: exactEmailUser.id,
            confidence: 1.0,
            reason: 'Auto-mapped: Exact email match',
          };
        } else {
          // Exact monitored account match
          const exactMonitored = candidates.monitoredAccounts.find(
            (m) => m.accountIdentifier.toLowerCase() === accountLower,
          );
          if (exactMonitored) {
            matchedMonitoredAccount = {
              id: exactMonitored.id,
              confidence: 0.95,
              reason: 'Auto-mapped: Exact monitored account identifier match',
            };
          }

          // Username prefix match (e.g. "admin" for "admin@company.com")
          if (!accountLower.includes('@')) {
            const prefixMatches = candidates.users.filter((u) => {
              const prefix = u.email.toLowerCase().split('@')[0];
              return prefix === accountLower;
            });

            if (prefixMatches.length === 1 && prefixMatches[0]) {
              matchedUser = {
                id: prefixMatches[0].id,
                confidence: 0.9,
                reason: 'Auto-mapped: Username prefix match on user email',
              };
            }
          }
        }
      }

      // 2. Match Asset / Device
      if (rawDevice) {
        const deviceLower = rawDevice.toLowerCase();

        // Exact asset code match
        const exactCodeAsset = candidates.assets.find(
          (a) => a.assetCode.toLowerCase() === deviceLower,
        );
        if (exactCodeAsset) {
          matchedAsset = {
            id: exactCodeAsset.id,
            confidence: 0.95,
            reason: 'Auto-mapped: Exact asset code match',
          };
        } else {
          // Exact asset name match
          const exactNameAsset = candidates.assets.find(
            (a) => a.name.toLowerCase() === deviceLower,
          );
          if (exactNameAsset) {
            matchedAsset = {
              id: exactNameAsset.id,
              confidence: 0.9,
              reason: 'Auto-mapped: Exact asset name match',
            };
          } else {
            // Substring: device identifier contains asset code (e.g. "DEMO-AST-VPN01-Agent")
            const codeSubstringAsset = candidates.assets.find(
              (a) => a.assetCode.length >= 4 && deviceLower.includes(a.assetCode.toLowerCase()),
            );
            if (codeSubstringAsset) {
              matchedAsset = {
                id: codeSubstringAsset.id,
                confidence: 0.85,
                reason: 'Auto-mapped: Device identifier contains asset code',
              };
            }
          }
        }
      }

      // 3. Determine mapping status
      const hasAccount = !!matchedUser || !!matchedMonitoredAccount;
      const hasAsset = !!matchedAsset;

      let status: 'MAPPED' | 'PARTIALLY_MAPPED' | 'UNMAPPED' = 'UNMAPPED';
      if (hasAccount && hasAsset) {
        status = 'MAPPED';
      } else if (hasAccount || hasAsset) {
        status = 'PARTIALLY_MAPPED';
      } else {
        status = 'UNMAPPED';
      }

      mappingStatusMap.set(event.id, status);

      // 4. Create entity mapping records (1 record per entity to satisfy chk_event_mapping_single_entity)
      if (matchedUser) {
        mappingsToCreate.push({
          event_id: event.id,
          user_id: matchedUser.id,
          asset_id: null,
          monitored_account_id: null,
          mapping_method: 'AUTO',
          confidence: new Prisma.Decimal(matchedUser.confidence),
          reason: matchedUser.reason,
          mapped_by: null,
          is_active: true,
          mapped_at: now,
        });
      }

      if (matchedMonitoredAccount) {
        mappingsToCreate.push({
          event_id: event.id,
          user_id: null,
          asset_id: null,
          monitored_account_id: matchedMonitoredAccount.id,
          mapping_method: 'AUTO',
          confidence: new Prisma.Decimal(matchedMonitoredAccount.confidence),
          reason: matchedMonitoredAccount.reason,
          mapped_by: null,
          is_active: true,
          mapped_at: now,
        });
      }

      if (matchedAsset) {
        mappingsToCreate.push({
          event_id: event.id,
          user_id: null,
          asset_id: matchedAsset.id,
          monitored_account_id: null,
          mapping_method: 'AUTO',
          confidence: new Prisma.Decimal(matchedAsset.confidence),
          reason: matchedAsset.reason,
          mapped_by: null,
          is_active: true,
          mapped_at: now,
        });
      }
    }

    return { mappingStatusMap, mappingsToCreate };
  },
};
