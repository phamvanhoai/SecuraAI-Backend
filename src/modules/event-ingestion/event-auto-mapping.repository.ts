import { prisma } from '../../database/prisma.js';

// Information for a user (employee)
export interface CandidateUser {
  id: string;
  email: string;
  fullName: string | null;
}

// Information for 1 monitoring account (e.g., VPN account, service account)
export interface CandidateMonitoredAccount {
  id: string;
  accountIdentifier: string;
  displayName: string | null;
  linkedUserId: string | null;
  assetId: string | null;
}

// Information 1: IT Assets (Servers, Laptops, Firewalls, etc.)
export interface CandidateAsset {
  id: string;
  name: string;
  assetCode: string;
  assetType: string;
  criticality: string | null;
}

export const eventAutoMappingRepository = {
  /** Fetches all ACTIVE users, monitored accounts, and assets in parallel as auto-mapping lookup candidates. */
  async findCandidates(): Promise<{
    users: CandidateUser[];
    monitoredAccounts: CandidateMonitoredAccount[];
    assets: CandidateAsset[];
  }> {
    const [users, monitoredAccounts, assets] = await Promise.all([
      // Get the list of ACTIVE employees
      prisma.users.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          email: true,
          full_name: true,
        },
      }),
      // Get the list of ACTIVE monitored accounts
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
      // Get the list of ACTIVE IT Assets
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
