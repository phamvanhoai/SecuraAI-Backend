import { prisma } from '../../database/prisma.js';

export const incidentAssetsRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
  },

  findIncident(incidentId: string) {
    return prisma.incidents.findUnique({
      where: { id: incidentId },
      select: { id: true, incident_code: true, title: true, status: true },
    });
  },

  findActiveAsset(assetId: string) {
    return prisma.assets.findFirst({
      where: { id: assetId, status: 'ACTIVE' },
      select: { id: true, asset_code: true, name: true, criticality: true },
    });
  },

  async findOptions(incidentId: string) {
    const [incident, assets] = await Promise.all([
      this.findIncident(incidentId),
      prisma.assets.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          asset_code: true,
          name: true,
          asset_type: true,
          criticality: true,
          incident_assets: {
            where: { incident_id: incidentId },
            select: { linked_at: true },
          },
        },
        orderBy: [{ asset_code: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
    ]);
    return { incident, assets };
  },

  link(incidentId: string, assetId: string, linkedBy: string) {
    return prisma.incident_assets.create({
      data: { incident_id: incidentId, asset_id: assetId, linked_by: linkedBy },
      select: {
        linked_at: true,
        incidents: { select: { id: true, incident_code: true, title: true } },
        assets: { select: { id: true, asset_code: true, name: true, criticality: true } },
      },
    });
  },
};
