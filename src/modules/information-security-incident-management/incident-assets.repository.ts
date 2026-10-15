import { prisma } from '../../database/prisma.js';
import type { IncidentAssetOptionsQuery } from './dto/link-incident-asset.dto.js';

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

  async findOptions(incidentId: string, query: IncidentAssetOptionsQuery) {
    const relationshipFilter =
      query.scope === 'linked'
        ? { some: { incident_id: incidentId } }
        : { none: { incident_id: incidentId } };
    const where = {
      status: 'ACTIVE' as const,
      incident_assets: relationshipFilter,
      ...(query.q
        ? {
            OR: [
              { asset_code: { contains: query.q, mode: 'insensitive' as const } },
              { name: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [incident, assets, total] = await Promise.all([
      this.findIncident(incidentId),
      prisma.assets.findMany({
        where,
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
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.assets.count({ where }),
    ]);
    return { incident, assets, total };
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

  unlink(incidentId: string, assetId: string) {
    return prisma.incident_assets.deleteMany({
      where: { incident_id: incidentId, asset_id: assetId },
    });
  },
};
