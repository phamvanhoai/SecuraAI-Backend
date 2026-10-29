import { prisma } from '../../database/prisma.js';

export interface CandidateUser {
  id: string;
  email: string;
  fullName: string | null;
}

export interface CandidateMonitoredAccount {
  id: string;
  accountIdentifier: string;
  displayName: string | null;
  linkedUserId: string | null;
  assetId: string | null;
}

export interface CandidateAsset {
  id: string;
  name: string;
  assetCode: string;
  assetType: string;
  criticality: string | null;
}

export const eventAutoMappingRepository = {
  async findCandidates(): Promise<{
    users: CandidateUser[];
    monitoredAccounts: CandidateMonitoredAccount[];
    assets: CandidateAsset[];
  }> {
    const [users, monitoredAccounts, assets] = await Promise.all([
      prisma.users.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          email: true,
          full_name: true,
        },
      }),
      prisma.monitored_accounts.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          account_identifier: true,
          display_name: true,
          linked_user_id: true,
          asset_id: true,
        },
      }),
      prisma.assets.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          asset_code: true,
          asset_type: true,
          criticality: true,
        },
      }),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
      })),
      monitoredAccounts: monitoredAccounts.map((m) => ({
        id: m.id,
        accountIdentifier: m.account_identifier,
        displayName: m.display_name,
        linkedUserId: m.linked_user_id,
        assetId: m.asset_id,
      })),
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name,
        assetCode: a.asset_code,
        assetType: a.asset_type,
        criticality: a.criticality,
      })),
    };
  },
};
