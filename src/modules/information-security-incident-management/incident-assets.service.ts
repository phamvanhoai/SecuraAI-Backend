import { AppError } from '../../common/errors/app-error.js';
import type { LinkIncidentAssetInput } from './dto/link-incident-asset.dto.js';
import { incidentAssetsRepository } from './incident-assets.repository.js';

async function requireSecurityOfficer(userId: string) {
  const actor = await incidentAssetsRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
}

export const incidentAssetsService = {
  async options(userId: string, incidentId: string) {
    await requireSecurityOfficer(userId);
    const { incident, assets } = await incidentAssetsRepository.findOptions(incidentId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    return {
      incident: {
        id: incident.id,
        incidentCode: incident.incident_code,
        title: incident.title,
        status: incident.status.toLowerCase(),
      },
      assets: assets.map((asset) => ({
        id: asset.id,
        assetCode: asset.asset_code,
        name: asset.name,
        assetType: asset.asset_type,
        criticality: asset.criticality,
        linked: asset.incident_assets.length > 0,
      })),
    };
  },

  async link(userId: string, incidentId: string, input: LinkIncidentAssetInput) {
    await requireSecurityOfficer(userId);
    const [incident, asset] = await Promise.all([
      incidentAssetsRepository.findIncident(incidentId),
      incidentAssetsRepository.findActiveAsset(input.assetId),
    ]);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Active asset not found');

    try {
      const link = await incidentAssetsRepository.link(incidentId, input.assetId, userId);
      return {
        incident: {
          id: link.incidents.id,
          incidentCode: link.incidents.incident_code,
          title: link.incidents.title,
        },
        asset: {
          id: link.assets.id,
          assetCode: link.assets.asset_code,
          name: link.assets.name,
          criticality: link.assets.criticality,
        },
        linkedAt: link.linked_at,
      };
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new AppError(
          409,
          'INCIDENT_ASSET_ALREADY_LINKED',
          'Asset is already linked to this incident',
        );
      throw error;
    }
  },
};
