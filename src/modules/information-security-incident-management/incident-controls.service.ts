import { AppError } from '../../common/errors/app-error.js';
import type { LinkIncidentControlInput } from './dto/link-incident-control.dto.js';
import { incidentControlsRepository } from './incident-controls.repository.js';

async function requireSecurityOfficer(userId: string) {
  const actor = await incidentControlsRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
}

const controlResponse = (control: {
  id: string;
  control_code: string;
  name: string;
  applicability: string;
  implementation_status: string;
}) => ({
  id: control.id,
  controlCode: control.control_code,
  name: control.name,
  applicability: control.applicability.toLowerCase(),
  implementationStatus: control.implementation_status.toLowerCase(),
});

export const incidentControlsService = {
  async options(userId: string, incidentId: string) {
    await requireSecurityOfficer(userId);
    const { incident, controls } = await incidentControlsRepository.findOptions(incidentId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    return {
      incident: {
        id: incident.id,
        incidentCode: incident.incident_code,
        title: incident.title,
        status: incident.status.toLowerCase(),
      },
      controls: controls.map((control) => ({
        ...controlResponse(control),
        linked: control.incident_controls.length > 0,
      })),
    };
  },
  async link(userId: string, incidentId: string, input: LinkIncidentControlInput) {
    await requireSecurityOfficer(userId);
    const [incident, control] = await Promise.all([
      incidentControlsRepository.findIncident(incidentId),
      incidentControlsRepository.findControl(input.controlId),
    ]);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    if (!control) throw new AppError(404, 'CONTROL_NOT_FOUND', 'Security control not found');
    try {
      const link = await incidentControlsRepository.link(incidentId, input.controlId, userId);
      return {
        incident: {
          id: link.incidents.id,
          incidentCode: link.incidents.incident_code,
          title: link.incidents.title,
        },
        control: controlResponse(link.security_controls),
        linkedAt: link.linked_at,
      };
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new AppError(
          409,
          'INCIDENT_CONTROL_ALREADY_LINKED',
          'Control is already linked to this incident',
        );
      throw error;
    }
  },
};
